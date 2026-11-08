/**
 * `deno task setup`: gets this computer ready to serve the home page, or checks it still is.
 * Safe to run any time: it looks at how things stand (bin/setup.ts gathers the facts), says
 * so, and asks before changing anything. This is the functional core: every decision is
 * here, and it reaches the computer only through the injected pipes.
 */
import { Context, Data, Effect } from "effect";
import { type CertPaths, certPlan } from "./cert-plan.ts";
import { PlanIo, runPlan, type Step } from "./plan.ts";
import {
  installPlan,
  plist,
  restartPlan,
  type ServiceName,
  serviceNames,
  type ServiceSettings,
} from "./service-plan.ts";
import { awaitServices, WaitIo } from "./service-wait.ts";

/** A command-line tool, as found on PATH. */
export type Tool =
  | { readonly found: false }
  | { readonly found: true; readonly path: string; readonly version: string };

/** One of the two launchd services, as found. */
export type ServiceProbe = {
  /** Its installed plist's text, or null when it isn't installed. */
  readonly plist: string | null;
  /** Something is accepting connections on its port. */
  readonly listening: boolean;
};

/** How things stand on this computer, as bin/setup.ts found them. */
export type Probes = {
  /** `Deno.build.os`, e.g. "darwin". */
  readonly os: string;
  /** e.g. "2.9.8". */
  readonly denoVersion: string;
  /** Deno's built-in bundler (`Deno.bundle`), which the server bundles the page with. */
  readonly hasBundler: boolean;
  readonly git: Tool;
  readonly openssl: Tool;
  /** macOS's `security`, which trusts the certificate in the keychain. */
  readonly security: Tool;
  readonly claude: Tool;
  readonly cert:
    | { readonly is: "missing" }
    /** null when its expiry date couldn't be read. */
    | { readonly is: "present"; readonly expires: Date | null };
  /** macOS trusts the certificate for localhost (its authority is in the login keychain). */
  readonly caTrusted: boolean;
  readonly services: Readonly<Record<ServiceName, ServiceProbe>>;
  readonly now: Date;
};

/** Where things go and what they're called: fixed for a given checkout. */
export type SetupSettings = {
  readonly cert: CertPaths;
  readonly service: ServiceSettings;
  readonly ports: Readonly<Record<ServiceName, number>>;
  readonly appUrl: string;
};

/** The pipes to the computer and to the person at the terminal. */
export class SetupIo extends Context.Tag("SetupIo")<
  SetupIo,
  {
    readonly probe: Effect.Effect<Probes>;
    /** Shows `question` and reads a line of reply; null when there's no more input. */
    readonly ask: (question: string) => Effect.Effect<string | null>;
    readonly say: (text: string) => Effect.Effect<void>;
    /** A fresh random hex serial number for a certificate. */
    readonly serial: Effect.Effect<string>;
  }
>() {}

/** Setup can't go on: why, and what to do before running it again. */
class Stop extends Data.TaggedError("Stop")<{ readonly message: string }> {}

/** How setup ended: ok when the page is ready to use. */
export type Outcome = { readonly ok: boolean };

export const claudeUrl = "https://code.claude.com/";
export const denoUrl = "https://docs.deno.com/runtime/getting_started/installation/";

const serviceTitles: Readonly<Record<ServiceName, string>> = {
  app: "server",
  assistant: "assistant service",
};

const logFiles: Readonly<Record<ServiceName, string>> = {
  app: "logs/server.log",
  assistant: "logs/assistant.log",
};

// ---------------------------------------------------------------------------
// Decisions (pure)

export type Answer = { readonly is: "yes" } | { readonly is: "no" } | { readonly is: "unclear" };

/** A reply to a yes/no question. Enter takes the default; no more input (Ctrl-D) means no. */
export const parseAnswer = (reply: string | null, yesByDefault: boolean): Answer => {
  if (reply === null) return { is: "no" };
  const text = reply.trim().toLowerCase();
  if (text === "") return { is: yesByDefault ? "yes" : "no" };
  if (text === "y" || text === "yes") return { is: "yes" };
  if (text === "n" || text === "no") return { is: "no" };
  return { is: "unclear" };
};

/** A requirement that isn't met, and how to meet it. */
export type Problem = { readonly label: string; readonly fix: string };

/** Just the version number from what a tool prints, e.g. "git version 2.50.1 (Apple Git-155)". */
export const versionNumber = (printed: string): string =>
  printed.match(/\d+(\.\d+)+/)?.at(0) ?? printed;

const majorVersion = (version: string): number => Number(version.split(".").at(0) ?? 0);

/** What setup needs before it can do anything: a ✓ line for each, or a problem. */
export const prerequisites = (
  p: Probes,
): ReadonlyArray<{ ok: true; label: string } | { ok: false; problem: Problem }> => {
  const tool = (name: string, t: Tool, problem: Problem) =>
    t.found
      ? {
        ok: true as const,
        label: `${name}${t.version === "" ? "" : ` ${versionNumber(t.version)}`}`,
      }
      : { ok: false as const, problem };
  return [
    p.os === "darwin" ? { ok: true, label: "macOS" } : {
      ok: false,
      problem: {
        label: `This is ${p.os}, but the home page runs only on macOS for now`,
        fix: "Its services (launchd) and certificate trust (the login keychain) are macOS-only",
      },
    },
    majorVersion(p.denoVersion) >= 2 && p.hasBundler
      ? { ok: true, label: `Deno ${p.denoVersion}` }
      : {
        ok: false,
        problem: {
          label: `Deno ${p.denoVersion} is too old: the server needs Deno 2 and its bundler`,
          fix: "Upgrade it with: deno upgrade",
        },
      },
    tool("git", p.git, {
      label: "git isn't installed",
      fix: "Install Apple's command line tools: xcode-select --install",
    }),
    tool("openssl", p.openssl, {
      label: "openssl isn't installed (it makes the certificate)",
      fix: "macOS includes it at /usr/bin/openssl; check your PATH",
    }),
    tool("security", p.security, {
      label: "security isn't installed (it trusts the certificate)",
      fix: "macOS includes it at /usr/bin/security; check your PATH",
    }),
  ];
};

const dayMs = 24 * 60 * 60 * 1000;

/** Renew this long before the certificate expires. */
export const renewWithinDays = 30;

/** Where the certificate stands, and so what setup offers to do about it. */
export type CertState =
  | { readonly is: "ok"; readonly until: string }
  | { readonly is: "missing" }
  | { readonly is: "untrusted" }
  | { readonly is: "expired"; readonly on: string }
  | { readonly is: "expiring"; readonly days: number; readonly on: string }
  | { readonly is: "unreadable" };

export const certState = (p: Probes): CertState => {
  if (p.cert.is === "missing") return { is: "missing" };
  if (p.cert.expires === null) return { is: "unreadable" };
  const on = p.cert.expires.toISOString().slice(0, 10);
  const days = Math.floor((p.cert.expires.getTime() - p.now.getTime()) / dayMs);
  if (days < 0) return { is: "expired", on };
  if (!p.caTrusted) return { is: "untrusted" };
  if (days < renewWithinDays) return { is: "expiring", days, on };
  return { is: "ok", until: on };
};

/** What to tell the person about a certificate that needs work, and whether it's essential. */
export const certOffer = (
  state: Exclude<CertState, { is: "ok" }>,
): { readonly explain: string; readonly essential: boolean } => {
  switch (state.is) {
    case "missing":
      return {
        explain: "The page is served over HTTPS, so it needs a certificate for localhost.",
        essential: true,
      };
    case "untrusted":
      return {
        explain: "macOS doesn't trust the localhost certificate, so browsers would warn about it.",
        essential: true,
      };
    case "expired":
      return { explain: `The localhost certificate expired on ${state.on}.`, essential: true };
    case "expiring":
      return {
        explain: `The localhost certificate expires in ${state.days} days (${state.on}).`,
        essential: false,
      };
    case "unreadable":
      return {
        explain: "The localhost certificate's expiry date couldn't be read.",
        essential: false,
      };
    default:
      return state satisfies never;
  }
};

/** Where the two services stand, and so what setup offers to do about them. */
export type ServicesState =
  /** Not installed, and something else holds the port one needs. */
  | { readonly is: "port-taken"; readonly name: ServiceName }
  | { readonly is: "not-installed" }
  /** Installed with other settings than these (e.g. another Deno, PATH or folder). */
  | { readonly is: "outdated" }
  /** Installed as they should be; `down` lists the ones not answering. */
  | { readonly is: "installed"; readonly down: ReadonlyArray<ServiceName> };

export const servicesState = (p: Probes, s: SetupSettings): ServicesState => {
  const missing = serviceNames.filter((name) => p.services[name].plist === null);
  const taken = missing.find((name) => p.services[name].listening);
  if (taken !== undefined) return { is: "port-taken", name: taken };
  if (missing.length > 0) return { is: "not-installed" };
  if (serviceNames.some((name) => p.services[name].plist !== plist(s.service, name))) {
    return { is: "outdated" };
  }
  return { is: "installed", down: serviceNames.filter((name) => !p.services[name].listening) };
};

// ---------------------------------------------------------------------------
// The conversation

const say = (text: string) => Effect.flatMap(SetupIo, (io) => io.say(text));

/** Asks a yes/no question until it gets a clear answer. */
const confirm = (question: string, yesByDefault: boolean): Effect.Effect<boolean, never, SetupIo> =>
  Effect.gen(function* () {
    const io = yield* SetupIo;
    const reply = yield* io.ask(`${question} ${yesByDefault ? "[Y/n]" : "[y/N]"}`);
    const answer = parseAnswer(reply, yesByDefault);
    switch (answer.is) {
      case "yes":
        return true;
      case "no":
        return false;
      case "unclear":
        yield* io.say("Please answer y or n.");
        return yield* confirm(question, yesByDefault);
      default:
        return answer satisfies never;
    }
  });

/** Runs a plan; a failed step stops setup, saying what failed and `then` what to do. */
const carryOut = (steps: ReadonlyArray<Step>, then: string) =>
  runPlan(steps).pipe(
    Effect.mapError((e) => new Stop({ message: `This step failed: ${e.description}\n${then}` })),
  );

const checkPrerequisites = (p: Probes) =>
  Effect.gen(function* () {
    const results = prerequisites(p);
    for (const r of results) {
      yield* say(r.ok ? `✓ ${r.label}` : `✗ ${r.problem.label}\n    → ${r.problem.fix}`);
    }
    if (results.some((r) => !r.ok)) {
      yield* Effect.fail(new Stop({ message: "Fix the ✗ items above first." }));
    }
  });

const checkClaude = (p: Probes) =>
  Effect.gen(function* () {
    if (p.claude.found) {
      yield* say(`✓ Claude Code ${versionNumber(p.claude.version)}`);
      return;
    }
    yield* say(
      "! Claude Code isn't installed. The page works without it, but the assistant (the\n" +
        "  part that changes the page for you) runs on it. To install it, follow\n" +
        `  ${claudeUrl}, then run claude once in a terminal to sign in.`,
    );
    if (!(yield* confirm("Carry on without it for now?", true))) {
      yield* Effect.fail(new Stop({ message: `Install Claude Code (${claudeUrl}) and sign in.` }));
    }
  });

/** Makes sure there's a trusted certificate. True if it made a new one. */
const ensureCert = (p: Probes, s: SetupSettings) =>
  Effect.gen(function* () {
    const state = certState(p);
    if (state.is === "ok") {
      yield* say(`✓ Localhost certificate, trusted, valid until ${state.until}`);
      return false;
    }
    const offer = certOffer(state);
    yield* say(
      `${offer.essential ? "✗" : "!"} ${offer.explain}\n` +
        "  I can make a new one, and have macOS trust it in your login keychain. It can only\n" +
        "  ever vouch for localhost. macOS will ask for your password to change the keychain.",
    );
    if (!(yield* confirm("Make it now?", true))) {
      if (offer.essential) {
        yield* Effect.fail(
          new Stop({ message: "Browsers won't load the page without a trusted certificate." }),
        );
      }
      return false;
    }
    const io = yield* SetupIo;
    yield* carryOut(
      certPlan(s.cert, yield* io.serial),
      "If you dismissed the keychain prompt, approve it next time.",
    );
    yield* say("✓ Made and trusted a new localhost certificate");
    return true;
  });

const install = (s: SetupSettings) =>
  Effect.gen(function* () {
    yield* carryOut(installPlan(s.service), "The output above should say why.");
    return serviceNames;
  });

/** The ones to wait for after a restart, or none if the person would rather not. */
const offerRestart = (
  s: SetupSettings,
  names: ReadonlyArray<ServiceName>,
  question: string,
  yesByDefault: boolean,
) =>
  Effect.gen(function* () {
    if (!(yield* confirm(question, yesByDefault))) return [];
    yield* carryOut(restartPlan(s.service.uid, names), "The output above should say why.");
    return names;
  });

const titles = (names: ReadonlyArray<ServiceName>) =>
  names.map((name) => serviceTitles[name]).join(" and ");

/**
 * Makes sure both services are installed and running, restarting them if they need it
 * (`certChanged`) or the person wants it. Returns the ones to wait for.
 */
const ensureServices = (p: Probes, s: SetupSettings, certChanged: boolean) =>
  Effect.gen(function* () {
    const state = servicesState(p, s);
    switch (state.is) {
      case "port-taken": {
        const port = s.ports[state.name];
        return yield* Effect.fail(
          new Stop({
            message:
              `Something else is using port ${port}, which the ${
                serviceTitles[state.name]
              } needs.\n` +
              `See what with: lsof -nP -iTCP:${port} -sTCP:LISTEN (a deno task dev, perhaps?)\n` +
              "Stop it.",
          }),
        );
      }
      case "not-installed": {
        yield* say(
          "! The server and the assistant service aren't installed. I can install them as\n" +
            "  background services (launchd), which start when you log in and restart if they\n" +
            "  ever stop.",
        );
        if (!(yield* confirm("Install them now?", true))) {
          return yield* Effect.fail(new Stop({ message: "Nothing serves the page until then." }));
        }
        return yield* install(s);
      }
      case "outdated": {
        yield* say(
          "! The services were installed with different settings, perhaps from another\n" +
            "  Deno, folder or PATH. Reinstalling updates them to this terminal's.",
        );
        return (yield* confirm("Reinstall them now?", true)) ? yield* install(s) : [];
      }
      case "installed": {
        const up = serviceNames.filter((name) => !state.down.includes(name));
        for (const name of up) {
          yield* say(`✓ The ${serviceTitles[name]} is running (port ${s.ports[name]})`);
        }
        for (const name of state.down) {
          yield* say(
            `✗ The ${serviceTitles[name]} is installed but isn't answering on port ${
              s.ports[name]
            }.\n    Its log, ${logFiles[name]}, should say why.`,
          );
        }
        if (certChanged) {
          return yield* offerRestart(
            s,
            serviceNames,
            "The services need restarting to use the new certificate. Restart them now?",
            true,
          );
        }
        if (state.down.length > 0) {
          return yield* offerRestart(s, state.down, `Restart the ${titles(state.down)}?`, true);
        }
        return yield* offerRestart(
          s,
          serviceNames,
          "Restart them anyway (say, after pulling new code)?",
          false,
        );
      }
      default:
        return state satisfies never;
    }
  });

/** Waits for the named services to take connections; stops setup if one doesn't. */
const waitFor = (names: ReadonlyArray<ServiceName>, s: SetupSettings) =>
  Effect.gen(function* () {
    if (names.length === 0) return;
    if (names.includes("app")) {
      yield* say("The server builds the page when it starts, which takes up to a minute.");
    }
    const back = yield* awaitServices(
      names.map((name) => ({
        name: serviceTitles[name],
        port: s.ports[name],
        log: logFiles[name],
      })),
    );
    if (!back) {
      yield* Effect.fail(new Stop({ message: "Fix what the log shows." }));
    }
  });

const rerun = "Then run deno task setup again. It picks up where you left off.";

/** Goes through setup, from what's needed to run it to the services serving the page. */
export const setup = (s: SetupSettings): Effect.Effect<Outcome, never, SetupIo | PlanIo | WaitIo> =>
  Effect.gen(function* () {
    const io = yield* SetupIo;
    const p = yield* io.probe;
    yield* checkPrerequisites(p);
    yield* checkClaude(p);
    const certChanged = yield* ensureCert(p, s);
    yield* waitFor(yield* ensureServices(p, s, certChanged), s);
    yield* say(
      `\nReady. Open ${s.appUrl}, and pin it or make it your home page.\n` +
        "Press F2 there to start making it your own.",
    );
    if (certChanged) {
      yield* say(
        "If Firefox was open while the certificate was made, quit and reopen it first: it\n" +
          "reads the keychain only when it starts.",
      );
    }
    return { ok: true };
  }).pipe(
    Effect.catchTag("Stop", (stop) =>
      Effect.gen(function* () {
        yield* say(`\n${stop.message}\n${rerun}`);
        return { ok: false };
      })),
  );
