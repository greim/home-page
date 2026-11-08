/** Static configuration shared by the server and the scripts in bin/. */
import { serviceLabels } from "../../tooling/service-plan.ts";

const root = new URL("../../", import.meta.url);
const path = (relative: string): string => new URL(relative, root).pathname;

const hostname = "127.0.0.1";
/** `PORT` lets a dev server run beside the installed service, which uses the default. */
const port = Number(Deno.env.get("PORT") ?? 8443);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be a port number, got ${Deno.env.get("PORT")}`);
}

/** The assistant service's port (`ASSISTANT_PORT`), so it outlives restarts of the main server. */
const assistantPort = Number(Deno.env.get("ASSISTANT_PORT") ?? 9443);
if (!Number.isInteger(assistantPort) || assistantPort < 1 || assistantPort > 65535) {
  throw new Error(`ASSISTANT_PORT must be a port number, got ${Deno.env.get("ASSISTANT_PORT")}`);
}

export const config = {
  repoRoot: path("."),
  hostname,
  port,
  hosts: new Set([`localhost:${port}`, `${hostname}:${port}`]),
  appUrl: `https://localhost:${port}/web/app`,
  /** Origins the page is served from: the only ones the assistant service answers. */
  appOrigins: new Set([`https://localhost:${port}`, `https://${hostname}:${port}`]),
  clientEntry: path("src/client/main.tsx"),
  serverEntry: path("src/server/main.ts"),
  /** One folder per widget type. */
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
  logsDir: path("logs"),
  /** The assistant service: Claude Code through the Agent SDK, in its own process and port. */
  assistant: {
    port: assistantPort,
    hosts: new Set([`localhost:${assistantPort}`, `${hostname}:${assistantPort}`]),
    entry: path("src/server/assistant-main.ts"),
    /** The agent works in the repo, like Claude Code run in a terminal there. */
    repoDir: path("."),
    /** Its copy of the layout and the page's screenshot. */
    workspaceDir: path("data/assistant"),
    /** Its own temp file, so it never collides with the main server's. */
    layoutTempFile: path("data/layout.json.assistant.tmp"),
    layoutCheckScript: path("bin/check-layout.ts"),
    registryFile: path("dist/widgets/registry.json"),
    stepTimeoutMs: 180_000,
    watched: ["src", "tooling", "deno.json", "deno.lock"],
    entries: {
      app: "src/server/main.ts",
      page: "src/client/main.tsx",
      assistant: "src/server/assistant-main.ts",
    },
    appPort: port,
    /** The launchd jobs' labels. launchd sets XPC_SERVICE_NAME to the label of what it runs. */
    appLabel: serviceLabels.app,
    label: serviceLabels.assistant,
  },
} as const;
