/**
 * Plans for installing/uninstalling the webserver as a launchd user agent.
 * launchd starts it at login and restarts it whenever it exits (KeepAlive).
 */
import type { Step } from "./plan.ts";

export const serviceLabel = "local.home-page";

export type ServiceSettings = {
  readonly uid: number;
  readonly home: string;
  readonly denoPath: string;
  readonly repoRoot: string;
  readonly serverEntry: string;
  readonly logsDir: string;
  readonly dataDir: string;
  /** Absolute path to claude, for the admin assistant (launchd's PATH won't find it). */
  readonly claudePath: string;
};

const escapeXml = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const str = (s: string) => `<string>${escapeXml(s)}</string>`;

export const plistPath = (home: string): string =>
  `${home}/Library/LaunchAgents/${serviceLabel}.plist`;

export const serverArgs = (s: ServiceSettings): ReadonlyArray<string> => [
  s.denoPath,
  "run",
  // Unrestricted so the server can fetch background images by URL. It only
  // ever listens on 127.0.0.1 (see src/server/config.ts).
  "--allow-net",
  "--allow-read",
  `--allow-write=${s.dataDir}`,
  "--allow-env",
  "--allow-run",
  s.serverEntry,
];

export const plist = (s: ServiceSettings): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${str(serviceLabel)}
  <key>ProgramArguments</key>
  <array>
${serverArgs(s).map((a) => `    ${str(a)}`).join("\n")}
  </array>
  <key>WorkingDirectory</key>${str(s.repoRoot)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>${str(s.home)}
    <key>NO_COLOR</key>${str("1")}
    <key>CLAUDE_PATH</key>${str(s.claudePath)}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key>${str("Background")}
  <key>StandardOutPath</key>${str(`${s.logsDir}/server.log`)}
  <key>StandardErrorPath</key>${str(`${s.logsDir}/server.log`)}
</dict>
</plist>
`;

const domain = (uid: number) => `gui/${uid}`;

const bootout = (uid: number): Step => ({
  is: "run",
  cmd: "launchctl",
  args: ["bootout", `${domain(uid)}/${serviceLabel}`],
  mayFail: true,
});

export const installPlan = (s: ServiceSettings): ReadonlyArray<Step> => [
  { is: "mkdir", path: s.logsDir },
  { is: "mkdir", path: `${s.home}/Library/LaunchAgents` },
  { is: "write", path: plistPath(s.home), text: plist(s), mode: 0o644 },
  bootout(s.uid),
  {
    is: "run",
    cmd: "launchctl",
    args: ["bootstrap", domain(s.uid), plistPath(s.home)],
    mayFail: false,
  },
];

export const uninstallPlan = (
  s: Pick<ServiceSettings, "uid" | "home">,
): ReadonlyArray<Step> => [
  bootout(s.uid),
  { is: "remove", path: plistPath(s.home) },
];
