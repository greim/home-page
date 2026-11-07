/**
 * `deno task doctor`: checks this computer has what the home page needs, and
 * says how to fix what's missing. This is the functional core: it judges facts
 * about the computer (gathered by bin/doctor.ts) and makes no checks itself.
 */

/** A command-line tool, as found on PATH. */
export type Tool =
  | { readonly found: false }
  | { readonly found: true; readonly path: string; readonly version: string };

/** What bin/doctor.ts found out. */
export type Probes = {
  /** `Deno.build.os`, e.g. "darwin". */
  readonly os: string;
  /** e.g. "2.9.8". */
  readonly denoVersion: string;
  /** Deno's built-in bundler (`Deno.bundle`), which the server bundles the page with. */
  readonly hasBundler: boolean;
  readonly openssl: Tool;
  /** macOS's `security`, which trusts the certificate in the keychain. */
  readonly security: Tool;
  readonly claude: Tool;
  /** The server's certificate, from `deno task setup-certs`. */
  readonly cert:
    | { readonly is: "missing" }
    /** null when its expiry date couldn't be read. */
    | { readonly is: "present"; readonly expires: Date | null };
  /** macOS trusts the certificate for localhost (its authority is in the login keychain). */
  readonly caTrusted: boolean;
  /** The main server's launchd service, from `deno task install-service`. */
  readonly serviceInstalled: boolean;
  /** Something is listening on the server's port. */
  readonly portInUse: boolean;
  readonly port: number;
  /** The assistant service's launchd service, also from `deno task install-service`. */
  readonly assistantInstalled: boolean;
  /** Something is listening on the assistant service's port. */
  readonly assistantPortInUse: boolean;
  readonly assistantPort: number;
  readonly now: Date;
};

export type Check = {
  /** "ok" passes; "warn" works but needs attention; "fail" keeps the page from working. */
  readonly status: "ok" | "warn" | "fail";
  readonly label: string;
  /** What to do about a warning or failure. */
  readonly fix: string | null;
};

const ok = (label: string): Check => ({ status: "ok", label, fix: null });
const warn = (label: string, fix: string): Check => ({ status: "warn", label, fix });
const fail = (label: string, fix: string): Check => ({ status: "fail", label, fix });

/** Warn this long before the certificate expires. */
const certWarningDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

const majorVersion = (version: string): number => Number(version.split(".").at(0) ?? 0);

const denoCheck = (p: Probes): Check => {
  if (majorVersion(p.denoVersion) < 2 || !p.hasBundler) {
    return fail(
      `Deno ${p.denoVersion} is too old: the server needs Deno 2 with its built-in bundler`,
      "Upgrade Deno: deno upgrade",
    );
  }
  return ok(`Deno ${p.denoVersion}`);
};

const toolCheck = (name: string, tool: Tool, missing: Check): Check =>
  tool.found
    ? ok(`${name}${tool.version === "" ? "" : ` ${tool.version}`} (${tool.path})`)
    : missing;

const certCheck = (p: Probes): Check => {
  const renew = "deno task setup-certs, then restart the service";
  switch (p.cert.is) {
    case "missing":
      return fail("No localhost certificate", "deno task setup-certs");
    case "present": {
      if (p.cert.expires === null) {
        return warn("The localhost certificate's expiry date couldn't be read", renew);
      }
      const daysLeft = Math.floor((p.cert.expires.getTime() - p.now.getTime()) / dayMs);
      const date = p.cert.expires.toISOString().slice(0, 10);
      if (daysLeft < 0) return fail(`The localhost certificate expired on ${date}`, renew);
      if (daysLeft < certWarningDays) {
        return warn(`The localhost certificate expires in ${daysLeft} days (${date})`, renew);
      }
      return ok(`Localhost certificate, valid until ${date}`);
    }
    default:
      return p.cert satisfies never;
  }
};

const serviceCheck = (
  service: { name: string; restart: string; log: string },
  installed: boolean,
  portInUse: boolean,
  port: number,
): Check => {
  const logs = `Check logs/${service.log}, then: deno task restart-service ${service.restart}`;
  if (installed) {
    return portInUse
      ? ok(`${service.name} installed and serving on port ${port}`)
      : fail(`${service.name} installed, but nothing is serving on port ${port}`, logs);
  }
  return portInUse
    ? fail(
      `Port ${port} is taken by something else, so the ${service.name.toLowerCase()} can't start`,
      `Find it with lsof -nP -iTCP:${port} -sTCP:LISTEN, and stop it`,
    )
    : warn(`${service.name} not installed`, "deno task install-service");
};

/**
 * Every check, in the order setup goes. Later checks still run when earlier
 * ones fail, so one run lists everything to fix.
 */
export const diagnose = (p: Probes): ReadonlyArray<Check> => [
  p.os === "darwin" ? ok("macOS") : fail(
    `This is ${p.os}, but the home page runs only on macOS`,
    "Its service (launchd) and certificate trust (the login keychain) are macOS-only",
  ),
  denoCheck(p),
  toolCheck(
    "openssl",
    p.openssl,
    fail("openssl not found (setup-certs needs it)", "macOS includes it at /usr/bin/openssl"),
  ),
  toolCheck(
    "security",
    p.security,
    fail("security not found (setup-certs needs it)", "macOS includes it at /usr/bin/security"),
  ),
  toolCheck(
    "claude",
    p.claude,
    warn(
      "claude not found (the assistant signs in with Claude Code's login)",
      "Install Claude Code (https://code.claude.com/) and run claude once to sign in",
    ),
  ),
  certCheck(p),
  // Without a certificate, trusting it is moot: making one comes first.
  ...(p.cert.is === "missing" ? [] : [
    p.caTrusted ? ok("Certificate trusted by macOS for localhost") : fail(
      "macOS doesn't trust the certificate, so browsers will warn about the page",
      "deno task setup-certs (approve the keychain prompt)",
    ),
  ]),
  serviceCheck(
    { name: "Server", restart: "app", log: "server.log" },
    p.serviceInstalled,
    p.portInUse,
    p.port,
  ),
  serviceCheck(
    { name: "Assistant service", restart: "assistant", log: "assistant.log" },
    p.assistantInstalled,
    p.assistantPortInUse,
    p.assistantPort,
  ),
];

const marks = { ok: "✓", warn: "!", fail: "✗" } as const;

/** The checks as the terminal shows them, one per line, each fix indented below. */
export const report = (checks: ReadonlyArray<Check>): string =>
  checks.map((c) => `${marks[c.status]} ${c.label}${c.fix === null ? "" : `\n    → ${c.fix}`}`)
    .join("\n");

/** Failures keep the page from working; warnings don't. */
export const healthy = (checks: ReadonlyArray<Check>): boolean =>
  checks.every((c) => c.status !== "fail");
