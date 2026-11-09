import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import { describe, PlanIo, type Step } from "./plan.ts";
import { plist, type ServiceName, type ServiceSettings } from "./service-plan.ts";
import { WaitIo } from "./service-wait.ts";
import {
  certOffer,
  certState,
  claudeUrl,
  loggedIn,
  parseAnswer,
  prerequisites,
  type Probes,
  servicesState,
  setup,
  SetupIo,
  type SetupSettings,
  versionNumber,
} from "./setup.ts";

const service: ServiceSettings = {
  uid: 501,
  home: "/Users/me",
  denoPath: "/opt/homebrew/bin/deno",
  repoRoot: "/Users/me/home-page",
  serverEntry: "/Users/me/home-page/src/server/main.ts",
  assistantEntry: "/Users/me/home-page/src/server/assistant-main.ts",
  logsDir: "/Users/me/home-page/logs",
  dataDir: "/Users/me/home-page/data",
  path: "/opt/homebrew/bin:/usr/bin:/bin",
};

const settings: SetupSettings = {
  cert: {
    secretsDir: "/Users/me/home-page/.secrets",
    caCertFile: "/Users/me/home-page/.secrets/ca.pem",
    certFile: "/Users/me/home-page/.secrets/localhost.pem",
    keyFile: "/Users/me/home-page/.secrets/localhost-key.pem",
    keychain: "/Users/me/Library/Keychains/login.keychain-db",
  },
  service,
  ports: { app: 8443, assistant: 9443 },
  appUrl: "https://localhost:8443/web/app",
};

const now = new Date("2026-11-08T12:00:00Z");

const running = (name: ServiceName) => ({ plist: plist(service, name), listening: true });

/** A computer with everything set up and running. */
const ready: Probes = {
  os: "darwin",
  denoVersion: "2.9.8",
  hasBundler: true,
  git: { found: true, path: "/usr/bin/git", version: "git version 2.50.1" },
  openssl: { found: true, path: "/usr/bin/openssl", version: "LibreSSL 3.3.6" },
  security: { found: true, path: "/usr/bin/security", version: "" },
  claude: { found: true, path: "/Users/me/.local/bin/claude", version: "2.1.319" },
  servicesLoggedIn: true,
  cert: { is: "present", expires: new Date("2028-02-09T12:00:00Z") },
  caTrusted: true,
  services: { app: running("app"), assistant: running("assistant") },
  now,
};

/** A fresh clone on a computer that has the tools. */
const fresh: Probes = {
  ...ready,
  cert: { is: "missing" },
  caTrusted: false,
  services: {
    app: { plist: null, listening: false },
    assistant: { plist: null, listening: false },
  },
};

type Session = {
  readonly ok: boolean;
  /** Everything shown: what was said, and each question as "? question". */
  readonly shown: string;
  readonly questions: ReadonlyArray<string>;
  /** Each command the plans ran. */
  readonly ran: ReadonlyArray<string>;
};

/**
 * Runs setup against `probes`, replying to each question in turn with `replies`
 * (null once they run out). Commands whose text includes `failing` exit 1; services
 * come back after a restart unless `staysDown`.
 */
const session = (
  probes: Probes,
  replies: ReadonlyArray<string | null>,
  options: { failing?: string; staysDown?: boolean } = {},
): Session => {
  const shown: string[] = [];
  const questions: string[] = [];
  const ran: string[] = [];
  const queue = [...replies];
  const outcome = Effect.runSync(
    setup(settings).pipe(
      Effect.provideService(
        SetupIo,
        SetupIo.of({
          probe: Effect.succeed(probes),
          ask: (question) =>
            Effect.sync(() => {
              questions.push(question);
              shown.push(`? ${question}`);
              return queue.shift() ?? null;
            }),
          say: (text) => Effect.sync(() => void shown.push(text)),
          serial: Effect.succeed("abc123"),
        }),
      ),
      Effect.provideService(
        PlanIo,
        PlanIo.of({
          mkdir: () => Effect.void,
          write: () => Effect.void,
          remove: () => Effect.void,
          run: (cmd, args) =>
            Effect.sync(() => {
              const line = describe({ is: "run", cmd, args, mayFail: false } satisfies Step);
              ran.push(line);
              return options.failing !== undefined && line.includes(options.failing) ? 1 : 0;
            }),
          log: () => Effect.void,
        }),
      ),
      Effect.provideService(
        WaitIo,
        WaitIo.of({
          listening: () => Effect.succeed(!options.staysDown),
          sleep: () => Effect.void,
          log: (line) => Effect.sync(() => void shown.push(line)),
        }),
      ),
    ),
  );
  return { ok: outcome.ok, shown: shown.join("\n"), questions, ran };
};

const ranAny = (s: Session, text: string) => s.ran.some((line) => line.includes(text));

Deno.test("a reply is yes, no, the default on Enter, or unclear", () => {
  assertEquals(parseAnswer("y", false), { is: "yes" });
  assertEquals(parseAnswer(" YES ", false), { is: "yes" });
  assertEquals(parseAnswer("n", true), { is: "no" });
  assertEquals(parseAnswer("No", true), { is: "no" });
  assertEquals(parseAnswer("", true), { is: "yes" });
  assertEquals(parseAnswer("", false), { is: "no" });
  assertEquals(parseAnswer(null, true), { is: "no" });
  assertEquals(parseAnswer("maybe", true), { is: "unclear" });
});

Deno.test("versions are shown as just their number", () => {
  assertEquals(versionNumber("git version 2.50.1 (Apple Git-155)"), "2.50.1");
  assertEquals(versionNumber("2.1.319 (Claude Code)"), "2.1.319");
  assertEquals(versionNumber("something odd"), "something odd");
});

Deno.test("prerequisites pass on a ready computer and name each missing one", () => {
  assertEquals(prerequisites(ready).every((r) => r.ok), true);
  const broken = prerequisites({
    ...ready,
    os: "linux",
    denoVersion: "1.46.0",
    hasBundler: false,
    git: { found: false },
    openssl: { found: false },
    security: { found: false },
  });
  assertEquals(broken.filter((r) => !r.ok).length, 5);
  assertEquals(
    prerequisites({ ...ready, hasBundler: false }).find((r) => !r.ok),
    {
      ok: false,
      problem: {
        label: "Deno 2.9.8 is too old: the server needs Deno 2 and its bundler",
        fix: "Upgrade it with: deno upgrade",
      },
    },
  );
});

Deno.test("the certificate's state follows its presence, trust and expiry", () => {
  const expiring = (iso: string): Probes => ({
    ...ready,
    cert: { is: "present", expires: new Date(iso) },
  });
  assertEquals(certState(ready), { is: "ok", until: "2028-02-09" });
  assertEquals(certState(fresh), { is: "missing" });
  assertEquals(certState({ ...ready, caTrusted: false }), { is: "untrusted" });
  assertEquals(certState(expiring("2026-11-01T00:00:00Z")), { is: "expired", on: "2026-11-01" });
  assertEquals(certState(expiring("2026-11-18T12:00:00Z")), {
    is: "expiring",
    days: 10,
    on: "2026-11-18",
  });
  assertEquals(certState({ ...ready, cert: { is: "present", expires: null } }), {
    is: "unreadable",
  });
});

Deno.test("only a missing, untrusted or expired certificate is essential to replace", () => {
  assertEquals(certOffer({ is: "missing" }).essential, true);
  assertEquals(certOffer({ is: "untrusted" }).essential, true);
  assertEquals(certOffer({ is: "expired", on: "2026-11-01" }), {
    explain: "The localhost certificate expired on 2026-11-01.",
    essential: true,
  });
  assertEquals(certOffer({ is: "expiring", days: 3, on: "2026-11-11" }).essential, false);
  assertEquals(certOffer({ is: "unreadable" }).essential, false);
});

Deno.test("the services' state follows what's installed, current and answering", () => {
  assertEquals(servicesState(ready, settings), { is: "installed", down: [] });
  assertEquals(servicesState(fresh, settings), { is: "not-installed" });
  assertEquals(
    servicesState(
      { ...fresh, services: { ...fresh.services, assistant: running("assistant") } },
      settings,
    ),
    { is: "not-installed" },
  );
  assertEquals(
    servicesState(
      { ...fresh, services: { ...fresh.services, app: { plist: null, listening: true } } },
      settings,
    ),
    { is: "port-taken", name: "app" },
  );
  assertEquals(
    servicesState(
      { ...ready, services: { ...ready.services, app: { plist: "old", listening: true } } },
      settings,
    ),
    { is: "outdated" },
  );
  assertEquals(
    servicesState(
      {
        ...ready,
        services: { ...ready.services, assistant: { ...running("assistant"), listening: false } },
      },
      settings,
    ),
    { is: "installed", down: ["assistant"] },
  );
});

Deno.test("on a fresh clone, Enter twice makes the certificate and installs the services", () => {
  const s = session(fresh, ["", ""]);
  assertEquals(s.ok, true);
  assertEquals(s.questions, ["Make it now? [Y/n]", "Install them now? [Y/n]"]);
  assertEquals(ranAny(s, "openssl req"), true);
  assertEquals(ranAny(s, "security add-trusted-cert"), true);
  assertEquals(ranAny(s, "launchctl bootstrap gui/501"), true);
  assertStringIncludes(s.shown, "Waiting for the server (port 8443)");
  assertStringIncludes(s.shown, "Waiting for the assistant service (port 9443)");
  assertStringIncludes(s.shown, "Ready. Open https://localhost:8443/web/app");
  assertStringIncludes(s.shown, "quit and reopen it first");
});

Deno.test("when everything's running, it offers a restart that defaults to no", () => {
  const s = session(ready, [""]);
  assertEquals(s.ok, true);
  assertEquals(s.questions, ["Restart them anyway (say, after pulling new code)? [y/N]"]);
  assertEquals(s.ran, []);
  assertStringIncludes(s.shown, "✓ The server is running (port 8443)");
  assertStringIncludes(s.shown, "Ready.");
  assertEquals(s.shown.includes("Firefox"), false);
});

Deno.test("restarting running services restarts both and waits for them", () => {
  const s = session(ready, ["y"]);
  assertEquals(s.ok, true);
  assertEquals(s.ran, [
    "launchctl kickstart -k gui/501/local.home-page",
    "launchctl kickstart -k gui/501/local.home-page.assistant",
  ]);
  assertStringIncludes(s.shown, "takes up to a minute");
});

Deno.test("a service that's down is named, and only it is restarted", () => {
  const down: Probes = {
    ...ready,
    services: { ...ready.services, assistant: { ...running("assistant"), listening: false } },
  };
  const s = session(down, [""]);
  assertEquals(s.ok, true);
  assertEquals(s.questions, ["Restart the assistant service? [Y/n]"]);
  assertEquals(s.ran, ["launchctl kickstart -k gui/501/local.home-page.assistant"]);
  assertStringIncludes(s.shown, "logs/assistant.log");
  assertEquals(s.shown.includes("builds the page"), false);
});

Deno.test("a service that doesn't come back stops setup, pointing at its log", () => {
  const s = session(ready, ["y"], { staysDown: true });
  assertEquals(s.ok, false);
  assertStringIncludes(s.shown, "not back after 120s: see logs/server.log");
  assertStringIncludes(s.shown, "Then run deno task setup again");
});

Deno.test("a new certificate leads to a restart of installed services", () => {
  const s = session({ ...ready, caTrusted: false }, ["", ""]);
  assertEquals(s.ok, true);
  assertEquals(s.questions, [
    "Make it now? [Y/n]",
    "The services need restarting to use the new certificate. Restart them now? [Y/n]",
  ]);
  assertEquals(ranAny(s, "launchctl kickstart"), true);
});

Deno.test("outdated services are reinstalled", () => {
  const outdated: Probes = {
    ...ready,
    services: { ...ready.services, app: { plist: "old", listening: true } },
  };
  const s = session(outdated, ["y"]);
  assertEquals(s.ok, true);
  assertEquals(s.questions, ["Reinstall them now? [Y/n]"]);
  assertEquals(ranAny(s, "launchctl bootstrap"), true);
});

Deno.test("declining to reinstall outdated services leaves them be", () => {
  const outdated: Probes = {
    ...ready,
    services: { ...ready.services, app: { plist: "old", listening: true } },
  };
  const s = session(outdated, ["n"]);
  assertEquals(s.ok, true);
  assertEquals(s.ran, []);
});

Deno.test("a missing prerequisite stops setup before any question", () => {
  const s = session({ ...ready, git: { found: false } }, []);
  assertEquals(s.ok, false);
  assertEquals(s.questions, []);
  assertStringIncludes(s.shown, "✗ git isn't installed\n    → Install Apple's command line tools");
  assertStringIncludes(s.shown, "Fix the ✗ items above first.\nThen run deno task setup again");
});

Deno.test("without Claude Code, setup can carry on or stop with where to get it", () => {
  const noClaude: Probes = { ...fresh, claude: { found: false } };
  const stopped = session(noClaude, ["n"]);
  assertEquals(stopped.ok, false);
  assertStringIncludes(stopped.shown, `Install Claude Code (${claudeUrl}) and sign in.`);
  assertEquals(stopped.ran, []);

  const carried = session(noClaude, ["", "", ""]);
  assertEquals(carried.ok, true);
  assertEquals(carried.questions.at(0), "Carry on without it for now? [Y/n]");
});

Deno.test("setup says how to log the services in when they aren't, and carries on", () => {
  const s = session({ ...ready, servicesLoggedIn: false }, [""]);
  assertEquals(s.ok, true);
  assertStringIncludes(s.shown, "! Claude Code isn't logged in for the services");
  assertStringIncludes(
    s.shown,
    '"CLAUDE_CODE_USE_BEDROCK": "1" to "env" in ~/.claude/settings.json',
  );
  for (const unasked of [true, null]) {
    const quiet = session({ ...ready, servicesLoggedIn: unasked }, [""]);
    assertEquals(quiet.shown.includes("isn't logged in"), false);
  }
});

Deno.test("loggedIn reads claude auth status, and nothing else", () => {
  assertEquals(loggedIn('{"loggedIn": true, "apiProvider": "bedrock"}'), true);
  assertEquals(loggedIn('{\n  "loggedIn": false,\n  "authMethod": "none"\n}\n'), false);
  assertEquals(loggedIn(""), null);
  assertEquals(loggedIn("Unknown command: auth"), null);
  assertEquals(loggedIn('{"loggedIn": "yes"}'), null);
  assertEquals(loggedIn("null"), null);
});

Deno.test("declining an essential certificate stops; declining a renewal carries on", () => {
  const declined = session(fresh, ["n"]);
  assertEquals(declined.ok, false);
  assertStringIncludes(
    declined.shown,
    "Browsers won't load the page without a trusted certificate.",
  );
  assertEquals(declined.ran, []);

  const expiring: Probes = {
    ...ready,
    cert: { is: "present", expires: new Date("2026-11-18T12:00:00Z") },
  };
  const renewal = session(expiring, ["n", "n"]);
  assertEquals(renewal.ok, true);
  assertStringIncludes(renewal.shown, "! The localhost certificate expires in 10 days");
  assertEquals(renewal.ran, []);
});

Deno.test("a failed keychain step stops setup before the services", () => {
  const s = session(fresh, [""], { failing: "add-trusted-cert" });
  assertEquals(s.ok, false);
  assertStringIncludes(s.shown, "This step failed: security add-trusted-cert");
  assertStringIncludes(s.shown, "approve it next time");
  assertEquals(ranAny(s, "launchctl"), false);
});

Deno.test("declining to install the services stops setup", () => {
  const s = session(fresh, ["", "n"]);
  assertEquals(s.ok, false);
  assertStringIncludes(s.shown, "Nothing serves the page until then.");
  assertEquals(ranAny(s, "launchctl"), false);
});

Deno.test("a port held by something else stops setup, saying how to find it", () => {
  const taken: Probes = {
    ...fresh,
    cert: ready.cert,
    caTrusted: true,
    services: { ...fresh.services, assistant: { plist: null, listening: true } },
  };
  const s = session(taken, []);
  assertEquals(s.ok, false);
  assertStringIncludes(s.shown, "Something else is using port 9443");
  assertStringIncludes(s.shown, "lsof -nP -iTCP:9443 -sTCP:LISTEN");
});

Deno.test("an unclear reply is asked again; no more input means no", () => {
  const s = session(ready, ["maybe", null]);
  assertEquals(s.ok, true);
  assertEquals(s.questions.length, 2);
  assertStringIncludes(s.shown, "Please answer y or n.");
  assertEquals(s.ran, []);
});
