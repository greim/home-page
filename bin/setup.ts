#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-sys=uid --allow-net=127.0.0.1
/**
 * Gets this computer ready to serve the home page, or checks it still is: looks at
 * how things stand, says so, and asks before changing anything. Safe to run any
 * time, services running or not. See tooling/setup.ts for the decisions.
 *
 *   deno task setup
 *
 * Trusting the certificate (the keychain) and installing the launchd services can't
 * be sandboxed, so they're verified by hand: run it on a fresh clone, then again with
 * everything set up, then with a service stopped (launchctl bootout gui/$(id -u)/local.home-page).
 */
import { encodeHex } from "@std/encoding/hex";
import { Effect } from "effect";
import { config } from "../src/server/config.ts";
import { PlanIo } from "../tooling/plan.ts";
import { livePlanIo } from "../tooling/plan-live.ts";
import { plistPath, type ServiceSettings } from "../tooling/service-plan.ts";
import { WaitIo } from "../tooling/service-wait.ts";
import { listening, liveWaitIo } from "../tooling/service-wait-live.ts";
import { type Probes, setup, SetupIo, type SetupSettings, type Tool } from "../tooling/setup.ts";

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

const readText = (path: string): Effect.Effect<string | null> =>
  Effect.tryPromise(() => Deno.readTextFile(path)).pipe(Effect.orElseSucceed(() => null));

/** When the certificate expires, from openssl's `notAfter=Feb  2 20:37:48 2029 GMT`. */
const certExpiry = (file: string): Effect.Effect<Date | null> =>
  run("openssl", ["x509", "-enddate", "-noout", "-in", file]).pipe(
    Effect.map(({ ok, out }) => {
      const date = new Date(out.replace(/^notAfter=/, ""));
      return ok && !Number.isNaN(date.getTime()) ? date : null;
    }),
  );

/** Whether macOS trusts the certificate for localhost, as browsers will check. */
const trusted = (file: string): Effect.Effect<boolean> =>
  run("security", ["verify-cert", "-c", file, "-p", "ssl", "-s", "localhost"]).pipe(
    Effect.map((o) => o.ok),
  );

const home = Deno.env.get("HOME") ?? "";

const service: ServiceSettings = {
  uid: Deno.uid() ?? 0,
  home,
  denoPath: Deno.execPath(),
  repoRoot: config.repoRoot,
  serverEntry: config.serverEntry,
  assistantEntry: config.assistant.entry,
  logsDir: config.logsDir,
  dataDir: config.dataDir,
  path: Deno.env.get("PATH") ?? "/usr/bin:/bin:/usr/sbin:/sbin",
};

const settings: SetupSettings = {
  cert: {
    secretsDir: config.secretsDir,
    caCertFile: config.caCertFile,
    certFile: config.certFile,
    keyFile: config.keyFile,
    keychain: `${home}/Library/Keychains/login.keychain-db`,
  },
  service,
  ports: { app: config.port, assistant: config.assistant.port },
  appUrl: config.appUrl,
};

const probe: Effect.Effect<Probes> = Effect.gen(function* () {
  const certExists = (yield* readText(config.certFile)) !== null;
  return {
    os: Deno.build.os,
    denoVersion: Deno.version.deno,
    hasBundler: "bundle" in Deno && typeof Deno.bundle === "function",
    git: yield* tool("git", ["--version"]),
    openssl: yield* tool("openssl", ["version"]),
    security: yield* tool("security", null),
    claude: yield* tool("claude", ["--version"]),
    cert: certExists
      ? { is: "present", expires: yield* certExpiry(config.certFile) }
      : { is: "missing" },
    caTrusted: certExists && (yield* trusted(config.certFile)),
    services: {
      app: {
        plist: yield* readText(plistPath(home, "app")),
        listening: yield* listening(config.port),
      },
      assistant: {
        plist: yield* readText(plistPath(home, "assistant")),
        listening: yield* listening(config.assistant.port),
      },
    },
    now: new Date(),
  };
});

const io = SetupIo.of({
  probe,
  ask: (question) => Effect.sync(() => prompt(question)),
  say: (text) => Effect.sync(() => console.log(text)),
  serial: Effect.sync(() => encodeHex(crypto.getRandomValues(new Uint8Array(16)))),
});

const outcome = await Effect.runPromise(
  setup(settings).pipe(
    Effect.provideService(SetupIo, io),
    Effect.provideService(PlanIo, livePlanIo),
    Effect.provideService(WaitIo, liveWaitIo),
  ),
);
Deno.exit(Number(!outcome.ok));
