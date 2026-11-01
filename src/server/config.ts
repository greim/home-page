/** Static configuration shared by the server and the scripts in bin/. */

const root = new URL("../../", import.meta.url);
const path = (relative: string): string => new URL(relative, root).pathname;

const hostname = "127.0.0.1";
const home = Deno.env.get("HOME") ?? "";
const port = 8443;

export const config = {
  repoRoot: path("."),
  hostname,
  port,
  hosts: new Set([`localhost:${port}`, `${hostname}:${port}`]),
  appUrl: `https://localhost:${port}/web/app`,
  clientEntry: path("src/client/main.tsx"),
  /** Files here are served as-is under /web/assets/ (flat; no subfolders). */
  staticDir: path("src/client/static"),
  serverEntry: path("src/server/main.ts"),
  secretsDir: path(".secrets"),
  certFile: path(".secrets/localhost.pem"),
  keyFile: path(".secrets/localhost-key.pem"),
  caCertFile: path(".secrets/ca.pem"),
  dataDir: path("data"),
  layoutFile: path("data/layout.json"),
  layoutTempFile: path("data/layout.json.tmp"),
  /** Background images uploaded or fetched from the web. */
  backgroundsDir: path("data/backgrounds"),
  logsDir: path("logs"),
  /** The admin assistant's agent: Claude Code, run in its own workspace with Unibrain. */
  assistant: {
    /** launchd gives the server a minimal PATH, so claude is found by its full path. */
    claudePath: Deno.env.get("CLAUDE_PATH") ?? `${home}/.local/bin/claude`,
    workspaceDir: path("data/assistant"),
    sourceDir: path("src"),
    backgroundsDir: path("data/backgrounds"),
    /** `?client=` names the assistant in Unibrain's event log, apart from interactive agents. */
    unibrainUrl: Deno.env.get("UNIBRAIN_URL") ??
      "http://127.0.0.1:7420/mcp?client=home-page-assistant",
  },
} as const;
