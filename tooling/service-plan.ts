/**
 * Plans for installing, uninstalling and restarting the home page's two launchd
 * user agents: the main server ("app") and the assistant service ("assistant"),
 * each in its own process so restarting one never stops the other. launchd
 * starts them at login and restarts them whenever they exit (KeepAlive).
 */
import type { Step } from "./plan.ts";

export type ServiceName = "app" | "assistant";

export const serviceNames: ReadonlyArray<ServiceName> = ["app", "assistant"];

export const serviceLabels: Readonly<Record<ServiceName, string>> = {
  app: "local.home-page",
  assistant: "local.home-page.assistant",
};

export type ServiceSettings = {
  readonly uid: number;
  readonly home: string;
  readonly denoPath: string;
  readonly repoRoot: string;
  readonly serverEntry: string;
  readonly assistantEntry: string;
  readonly logsDir: string;
  readonly dataDir: string;
  /**
   * The installing shell's PATH. launchd's own is minimal, and the assistant's agent runs
   * commands (deno, git, ...) the way a terminal would.
   */
  readonly path: string;
};

const escapeXml = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const str = (s: string) => `<string>${escapeXml(s)}</string>`;

export const plistPath = (home: string, name: ServiceName): string =>
  `${home}/Library/LaunchAgents/${serviceLabels[name]}.plist`;

export const serverArgs = (s: ServiceSettings, name: ServiceName): ReadonlyArray<string> => [
  s.denoPath,
  "run",
  // To listen. It only ever listens on 127.0.0.1 (see src/server/config.ts).
  "--allow-net",
  "--allow-read",
  `--allow-write=${s.dataDir}`,
  "--allow-env",
  "--allow-run",
  // The Agent SDK asks the OS for the home directory.
  ...(name === "assistant" ? ["--allow-sys"] : []),
  name === "assistant" ? s.assistantEntry : s.serverEntry,
];

const logFile = (s: ServiceSettings, name: ServiceName) =>
  `${s.logsDir}/${name === "assistant" ? "assistant" : "server"}.log`;

export const plist = (s: ServiceSettings, name: ServiceName): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${str(serviceLabels[name])}
  <key>ProgramArguments</key>
  <array>
${serverArgs(s, name).map((a) => `    ${str(a)}`).join("\n")}
  </array>
  <key>WorkingDirectory</key>${str(s.repoRoot)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>${str(s.home)}
    <key>PATH</key>${str(s.path)}
    <key>NO_COLOR</key>${str("1")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key>${str(name === "assistant" ? "Interactive" : "Background")}
  <key>StandardOutPath</key>${str(logFile(s, name))}
  <key>StandardErrorPath</key>${str(logFile(s, name))}
</dict>
</plist>
`;

const domain = (uid: number) => `gui/${uid}`;

const bootout = (uid: number, name: ServiceName): Step => ({
  is: "run",
  cmd: "launchctl",
  args: ["bootout", `${domain(uid)}/${serviceLabels[name]}`],
  mayFail: true,
});

/**
 * Waits until launchd has finished removing the agent (up to 10 s). `bootout` returns before
 * it has, and bootstrapping meanwhile fails with "Bootstrap failed: 5: Input/output error".
 */
const awaitRemoved = (uid: number, name: ServiceName): Step => ({
  is: "run",
  cmd: "/bin/sh",
  args: [
    "-c",
    `for i in $(seq 50); do launchctl print ${domain(uid)}/${
      serviceLabels[name]
    } >/dev/null 2>&1 || exit 0; sleep 0.2; done; echo "launchd is still removing ${
      serviceLabels[name]
    }" >&2; exit 1`,
  ],
  mayFail: false,
});

export const installPlan = (s: ServiceSettings): ReadonlyArray<Step> => [
  { is: "mkdir", path: s.logsDir },
  { is: "mkdir", path: `${s.home}/Library/LaunchAgents` },
  ...serviceNames.flatMap((name): ReadonlyArray<Step> => [
    { is: "write", path: plistPath(s.home, name), text: plist(s, name), mode: 0o644 },
    bootout(s.uid, name),
    awaitRemoved(s.uid, name),
    {
      is: "run",
      cmd: "launchctl",
      args: ["bootstrap", domain(s.uid), plistPath(s.home, name)],
      mayFail: false,
    },
  ]),
];

export const uninstallPlan = (
  s: Pick<ServiceSettings, "uid" | "home">,
): ReadonlyArray<Step> =>
  serviceNames.flatMap((name): ReadonlyArray<Step> => [
    bootout(s.uid, name),
    { is: "remove", path: plistPath(s.home, name) },
  ]);

/** Restarts the named services (kills and relaunches them), in order. */
export const restartPlan = (
  uid: number,
  names: ReadonlyArray<ServiceName>,
): ReadonlyArray<Step> =>
  names.map((name) => ({
    is: "run",
    cmd: "launchctl",
    args: ["kickstart", "-k", `${domain(uid)}/${serviceLabels[name]}`],
    mayFail: false,
  }));

/**
 * The services a `restart-service` command line names: none means both; anything that
 * isn't a service name is an error message.
 */
export const parseServiceNames = (
  args: ReadonlyArray<string>,
): { ok: true; names: ReadonlyArray<ServiceName> } | { ok: false; message: string } => {
  if (args.length === 0) return { ok: true, names: serviceNames };
  const unknown = args.filter((a) => !serviceNames.includes(a as ServiceName));
  return unknown.length === 0
    ? { ok: true, names: serviceNames.filter((n) => args.includes(n)) }
    : {
      ok: false,
      message: `Unknown service ${unknown.join(", ")}: expected ${serviceNames.join(" or ")}`,
    };
};
