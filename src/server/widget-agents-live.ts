/**
 * Imperative shell for widget agents (see widget-agents.ts): the registry file, the
 * user's MCP config, a folder per run, its files, and Claude Code through the Agent SDK.
 */
import { type Options, query } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Stream } from "effect";
import { IoError } from "./http.ts";
import { type McpConfig, WidgetAgentIo } from "./widget-agents.ts";

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

const readJson = (path: string): Promise<Record<string, unknown>> =>
  Deno.readTextFile(path).then((text) => JSON.parse(text) as Record<string, unknown>, () => ({}));

const servers = (value: unknown): Record<string, McpConfig> =>
  typeof value === "object" && value !== null ? value as Record<string, McpConfig> : {};

/**
 * The MCP servers configured in Claude Code, by name: the user's (~/.claude.json), the
 * user's for this repo, and the repo's (.mcp.json), later ones winning.
 */
const mcpConfigs = async (home: string, repoDir: string) => {
  const user = await readJson(`${home}/.claude.json`);
  const projects = servers(user["projects"]);
  return {
    ...servers(user["mcpServers"]),
    ...servers(servers(projects[repoDir])["mcpServers"]),
    ...servers((await readJson(`${repoDir}/.mcp.json`))["mcpServers"]),
  };
};

/**
 * `runsDir` holds each run's folder (under data/, the only place the service may write);
 * `home` and `repoDir` are where Claude Code's config is.
 */
export const widgetAgentIoLive = (
  settings: { registryFile: string; runsDir: string; home: string; repoDir: string },
) =>
  WidgetAgentIo.of({
    readRegistry: attempt(() => Deno.readTextFile(settings.registryFile)),
    readMcpConfigs: attempt(() => mcpConfigs(settings.home, settings.repoDir)).pipe(
      Effect.orElseSucceed(() => ({})),
    ),
    makeWorkdir: attempt(async () => {
      await Deno.mkdir(settings.runsDir, { recursive: true });
      // Its real path: Claude Code asks about files by their real paths.
      return await Deno.realPath(await Deno.makeTempDir({ dir: settings.runsDir, prefix: "run-" }));
    }),
    removeWorkdir: (dir) =>
      attempt(() => Deno.remove(dir, { recursive: true })).pipe(Effect.ignore),
    writeFile: (path, bytes) =>
      attempt(async () => {
        await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
        await Deno.writeFile(path, bytes);
      }),
    listFiles: (dir) =>
      attempt(async () => {
        const files = [];
        for await (const entry of Deno.readDir(dir)) {
          if (entry.isFile) {
            files.push({ name: entry.name, bytes: (await Deno.stat(`${dir}/${entry.name}`)).size });
          }
        }
        return files.sort((a, b) => a.name.localeCompare(b.name));
      }).pipe(Effect.orElseSucceed(() => [])),
    readFile: (path) => attempt(() => Deno.readFile(path)),
    query: (options, prompt, decide) =>
      Stream.unwrapScoped(Effect.gen(function* () {
        const abortController = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (controller) => Effect.sync(() => controller.abort()),
        );
        const run = query({
          prompt,
          options: {
            ...(options as unknown as Options),
            abortController,
            canUseTool: (toolName, input) =>
              Effect.runPromise(decide(toolName, input)).then((decision) =>
                decision.behavior === "allow"
                  ? { behavior: "allow" as const, updatedInput: { ...decision.updatedInput } }
                  : decision
              ),
          },
        });
        return Stream.fromAsyncIterable(run, (cause) => new IoError({ cause }));
      })),
    newId: Effect.sync(() => crypto.randomUUID()),
  });
