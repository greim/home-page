/** Static configuration shared by the server and the scripts in bin/. */

const root = new URL("../../", import.meta.url);
const path = (relative: string): string => new URL(relative, root).pathname;

const hostname = "127.0.0.1";
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
} as const;
