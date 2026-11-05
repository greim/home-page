/** Static configuration shared by the server and the scripts in bin/. */

const root = new URL("../../", import.meta.url);
const path = (relative: string): string => new URL(relative, root).pathname;

const hostname = "127.0.0.1";
const home = Deno.env.get("HOME") ?? "";
/** `PORT` lets a dev server run beside the installed service, which uses the default. */
const port = Number(Deno.env.get("PORT") ?? 8443);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be a port number, got ${Deno.env.get("PORT")}`);
}

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
  /** One folder per widget type. See SELF_BUILDING.md. */
  widgetsSourceDir: path("src/client/widgets"),
  /** Build output that isn't kept in git. */
  distDir: path("dist"),
  /** The widget build's output, served under /web/assets/widgets/. */
  widgetsOutDir: path("dist/widgets"),
  widgetBuildScript: path("bin/build-widgets.ts"),
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
  /** The admin assistant's agent: Claude Code, run in its own workspace. See SELF_BUILDING.md. */
  assistant: {
    /** launchd gives the server a minimal PATH, so claude is found by its full path. */
    claudePath: Deno.env.get("CLAUDE_PATH") ?? `${home}/.local/bin/claude`,
    workspaceDir: path("data/assistant"),
    repoDir: path("."),
    widgetsDir: path("src/client/widgets"),
    secretsDir: path(".secrets"),
    backgroundsDir: path("data/backgrounds"),
    distDir: path("dist"),
    widgetBuildScript: path("bin/build-widgets.ts"),
    layoutCheckScript: path("bin/check-layout.ts"),
    registryFile: path("dist/widgets/registry.json"),
    stepTimeoutMs: 180_000,
  },
} as const;
