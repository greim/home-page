#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env --allow-net=127.0.0.1
/**
 * Checks this computer has what the home page needs, and says how to fix
 * what's missing. Exits non-zero if anything keeps the page from working.
 * See tooling/doctor.ts for the checks.
 *
 *   deno task doctor
 */
import { Effect } from "effect";
import { config } from "../src/server/config.ts";
import { diagnose, healthy, type Probes, report, type Tool } from "../tooling/doctor.ts";
import { plistPath } from "../tooling/service-plan.ts";

type Output = { readonly ok: boolean; readonly out: string };

/** Runs a command; a command that can't run at all counts as failing, with no output. */
const run = (cmd: string, args: ReadonlyArray<string>): Effect.Effect<Output> =>
  Effect.tryPromise(() => new Deno.Command(cmd, { args: [...args] }).output()).pipe(
    Effect.map((o) => ({ ok: o.success, out: new TextDecoder().decode(o.stdout).trim() })),
    Effect.orElseSucceed(() => ({ ok: false, out: "" })),
  );

/** A tool on PATH, with the first line of what `versionArgs` prints (none for none). */
const tool = (name: string, versionArgs: ReadonlyArray<string> | null): Effect.Effect<Tool> =>
  Effect.gen(function* () {
    const which = yield* run("/usr/bin/which", [name]);
    if (!which.ok || which.out === "") return { found: false } as const;
    const version = versionArgs === null ? { ok: true, out: "" } : yield* run(name, versionArgs);
    return { found: true, path: which.out, version: version.out.split("\n").at(0) ?? "" } as const;
  });

const exists = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.stat(path)).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

/** When the certificate expires, from openssl's `notAfter=Feb  2 20:37:48 2029 GMT`. */
const certExpiry = (file: string): Effect.Effect<Date | null> =>
  run("openssl", ["x509", "-enddate", "-noout", "-in", file]).pipe(
    Effect.map(({ ok, out }) => {
      const date = new Date(out.replace(/^notAfter=/, ""));
      return ok && !Number.isNaN(date.getTime()) ? date : null;
    }),
  );

const listening = (port: number): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.connect({ hostname: "127.0.0.1", port })).pipe(
    Effect.map((conn) => {
      conn.close();
      return true;
    }),
    Effect.orElseSucceed(() => false),
  );

/** Whether macOS trusts the certificate for localhost, as browsers will check. */
const trusted = (file: string): Effect.Effect<boolean> =>
  run("security", ["verify-cert", "-c", file, "-p", "ssl", "-s", "localhost"]).pipe(
    Effect.map((o) => o.ok),
  );

const probe: Effect.Effect<Probes> = Effect.gen(function* () {
  const certPresent = yield* exists(config.certFile);
  return {
    os: Deno.build.os,
    denoVersion: Deno.version.deno,
    hasBundler: "bundle" in Deno && typeof Deno.bundle === "function",
    openssl: yield* tool("openssl", ["version"]),
    security: yield* tool("security", null),
    claude: yield* tool("claude", ["--version"]),
    cert: certPresent
      ? { is: "present", expires: yield* certExpiry(config.certFile) }
      : { is: "missing" },
    caTrusted: certPresent && (yield* trusted(config.certFile)),
    serviceInstalled: yield* exists(plistPath(Deno.env.get("HOME") ?? "", "app")),
    portInUse: yield* listening(config.port),
    port: config.port,
    assistantInstalled: yield* exists(plistPath(Deno.env.get("HOME") ?? "", "assistant")),
    assistantPortInUse: yield* listening(config.assistant.port),
    assistantPort: config.assistant.port,
    now: new Date(),
  };
});

const checks = diagnose(await Effect.runPromise(probe));
console.log(report(checks));
console.log(
  healthy(checks)
    ? `\nReady. Open ${config.appUrl}`
    : "\nFix the ✗ items above, then run deno task doctor again.",
);
Deno.exit(healthy(checks) ? 0 : 1);
