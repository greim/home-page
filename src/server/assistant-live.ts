/**
 * Imperative shell for the assistant service: the real workspace files, the
 * layout check run with `deno`, and Claude Code through the Agent SDK, behind
 * the {@link AssistantIo} pipes.
 */
import {
  getSessionMessages,
  listSessions,
  type PermissionUpdate,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { encodeBase64 } from "@std/encoding/base64";
import { encodeHex } from "@std/encoding/hex";
import { Effect, Option, Queue, Runtime } from "effect";
import {
  type AgentSettings,
  sessionOptions,
  workspaceLayoutName,
  workspaceScreenshotName,
} from "./assistant-agent.ts";
import type { Capabilities, PermissionMode } from "../common/assistant.ts";
import { AssistantIo, type Image, type ToolDecision } from "./assistant.ts";
import { IoError } from "./http.ts";
import {
  type CheckSettings,
  layoutStep,
  runSteps,
  type Step,
  type StepResult,
} from "./widget-checks.ts";

export type AssistantSettings = AgentSettings & CheckSettings & {
  /** The widget build's registry.json. */
  readonly registryFile: string;
  /** Where code changes could be, relative to the repo: folders, and single files. */
  readonly watched: ReadonlyArray<string>;
  /** Each process's entry point, relative to the repo, for its module graph. */
  readonly entries: { readonly app: string; readonly page: string; readonly assistant: string };
  /** The main server's launchd job (gui/<uid>/<label>) and port. */
  readonly appJob: string;
  readonly appPort: number;
  /** Most time the layout check may take before it's stopped and counted as failed. */
  readonly stepTimeoutMs: number;
};

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

/** Runs `deno` with the step's arguments in the repo, collecting all its output. */
const runStep = (settings: AssistantSettings) => (step: Step) =>
  attempt(async (): Promise<StepResult> => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: [...step.args],
      cwd: settings.repoDir,
      env: { NO_COLOR: "1" },
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(settings.stepTimeoutMs),
    }).output();
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    const timedOut = output.signal !== null
      ? `\n(Stopped after ${settings.stepTimeoutMs} ms.)`
      : "";
    return {
      code: output.success ? 0 : output.code || 1,
      output: `${decode(output.stdout)}${decode(output.stderr)}${timedOut}`,
    };
  });

/** Every file under `dir` (relative to the repo), recursively; none if it's missing. */
const listFiles = async (repo: string, dir: string): Promise<Array<string>> => {
  const info = await Deno.stat(`${repo}/${dir}`).catch(() => null);
  if (info === null) return [];
  if (info.isFile) return [dir];
  const entries = await Array.fromAsync(Deno.readDir(`${repo}/${dir}`));
  const nested = await Promise.all(entries.map((e) => listFiles(repo, `${dir}/${e.name}`)));
  return nested.flat();
};

const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  encodeHex(await crypto.subtle.digest("SHA-256", bytes));

/** The local modules `deno info` finds for an entry point, relative to the repo. */
const moduleGraph = async (repo: string, entry: string): Promise<ReadonlySet<string>> => {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json", entry],
    cwd: repo,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
  const info: { modules: Array<{ specifier: string; error?: string }> } = JSON.parse(
    new TextDecoder().decode(output.stdout),
  );
  // A module that can't be loaded is reported in the output, not by the exit code.
  const failed = info.modules.find((m) => m.error !== undefined);
  if (failed !== undefined) throw new Error(failed.error);
  // Specifiers are real paths (e.g. /private/var for /var).
  const real = await Deno.realPath(repo);
  const root = new URL(`file://${real.endsWith("/") ? real : `${real}/`}`).href;
  return new Set(
    info.modules.map((m) => m.specifier).filter((s) => s.startsWith(root)).map((s) =>
      decodeURIComponent(s.slice(root.length))
    ),
  );
};

/** The user's messages, as the SDK's streaming input reads them. */
async function* userMessages(
  inbox: Queue.Dequeue<{ readonly text: string; readonly images: ReadonlyArray<Image> }>,
): AsyncGenerator<SDKUserMessage> {
  while (true) {
    const { text, images } = await Effect.runPromise(Queue.take(inbox));
    yield {
      type: "user",
      message: {
        role: "user",
        content: images.length === 0 ? text : [
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mediaType,
              data: encodeBase64(image.data),
            },
          })),
          { type: "text" as const, text },
        ],
      },
      parent_tool_use_id: null,
      session_id: "",
    };
  }
}

/** What Claude Code offers in the repo, read from a session that's never sent a message. */
const readCapabilities = async (settings: AssistantSettings): Promise<Capabilities> => {
  // Input that never comes: the probe is asked about itself, never sent a message.
  const nothing: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  };
  const probe = query({
    prompt: nothing,
    options: { cwd: settings.repoDir, settingSources: ["user", "project", "local"] },
  });
  try {
    const [commands, models] = await Promise.all([
      probe.supportedCommands(),
      probe.supportedModels(),
    ]);
    return {
      commands: commands.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.argumentHint,
      })),
      models: models.map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
      })),
    };
  } finally {
    probe.close();
  }
};

export const assistantIoLive = (settings: AssistantSettings): AssistantIo["Type"] => {
  const layoutFile = `${settings.workspaceDir}/${workspaceLayoutName}`;
  const screenshotFile = `${settings.workspaceDir}/${workspaceScreenshotName}`;
  return AssistantIo.of({
    readWorkspaceLayout: attempt(() => Deno.readTextFile(layoutFile)),
    writeWorkspaceLayout: (text) =>
      attempt(async () => {
        await Deno.mkdir(settings.workspaceDir, { recursive: true });
        await Deno.writeTextFile(layoutFile, text);
      }),
    // Written after the layout, which creates the workspace.
    writeWorkspaceScreenshot: (jpeg) => attempt(() => Deno.writeFile(screenshotFile, jpeg)),
    removeWorkspaceScreenshot: attempt(() => Deno.remove(screenshotFile)),
    readRegistry: attempt(() => Deno.readTextFile(settings.registryFile)),
    fingerprint: attempt(async () => {
      const files = (await Promise.all(
        settings.watched.map((dir) => listFiles(settings.repoDir, dir)),
      )).flat();
      const hashes = await Promise.all(
        files.map(async (f) => [f, await sha256(await Deno.readFile(`${settings.repoDir}/${f}`))]),
      );
      return new Map(hashes.map(([f, h]) => [f ?? "", h ?? ""]));
    }),
    moduleGraphs: attempt(async () => ({
      app: await moduleGraph(settings.repoDir, settings.entries.app),
      page: await moduleGraph(settings.repoDir, settings.entries.page),
      assistant: await moduleGraph(settings.repoDir, settings.entries.assistant),
    })),
    restartApp: attempt(() =>
      new Deno.Command("launchctl", { args: ["kickstart", "-k", settings.appJob] }).output()
    ).pipe(
      Effect.flatMap((o) =>
        o.success ? Effect.void : Effect.fail(
          new IoError({ cause: new TextDecoder().decode(o.stderr).trim() || `exit ${o.code}` }),
        )
      ),
    ),
    appListening: attempt(() => Deno.connect({ hostname: "127.0.0.1", port: settings.appPort }))
      .pipe(
        Effect.map((conn) => {
          conn.close();
          return true;
        }),
        Effect.orElseSucceed(() => false),
      ),
    // Shortly, so the notice saying so reaches clients first.
    exitForRestart: Effect.sync(() => void setTimeout(() => Deno.exit(0), 500)),
    checkWorkspaceLayout: runSteps([layoutStep(settings, layoutFile)], runStep(settings)),
    // The repo's sessions, the terminal's included (SDK-started ones are "programmatic").
    listSessions: attempt(() =>
      listSessions({ dir: settings.repoDir, includeProgrammatic: true, limit: 50 })
    ),
    readSessionMessages: (sessionId) =>
      attempt(() => getSessionMessages(sessionId, { dir: settings.repoDir })),
    capabilities: attempt(() => readCapabilities(settings)),
    startSession: ({ resume, model, mode, registry, decide }) =>
      Effect.gen(function* () {
        const runtime = yield* Effect.runtime<never>();
        const inbox = yield* Queue.unbounded<
          { readonly text: string; readonly images: ReadonlyArray<Image> }
        >();
        const session = yield* Effect.acquireRelease(
          Effect.sync(() =>
            query({
              prompt: userMessages(inbox),
              options: {
                ...sessionOptions(settings, resume, registry, mode),
                ...(model === null ? {} : { model }),
                // The SDK cancels a request it no longer needs by aborting `signal`.
                canUseTool: (toolName, input, options) =>
                  Runtime.runPromise(runtime)(
                    decide({
                      toolName,
                      input,
                      description: options.description ?? options.title ?? null,
                      suggestions: options.suggestions ?? [],
                    }),
                    { signal: options.signal },
                  ).then(sdkDecision),
              },
            })
          ),
          (q) => Effect.sync(() => q.close()),
        );
        return {
          send: (text: string, images: ReadonlyArray<Image>) =>
            Effect.asVoid(Queue.offer(inbox, { text, images })),
          setModel: (chosen: string | null) => attempt(() => session.setModel(chosen ?? undefined)),
          next: attempt(() => session.next()).pipe(
            Effect.map((r) => r.done === true ? Option.none() : Option.some<unknown>(r.value)),
          ),
          interrupt: Effect.asVoid(attempt(() => session.interrupt())),
          setMode: (mode: PermissionMode) => attempt(() => session.setPermissionMode(mode)),
          contextUsage: attempt(() => session.getContextUsage({ detail: "summary" })).pipe(
            Effect.map((usage) => ({ percent: usage.percentage, model: usage.model })),
          ),
        };
      }),
  });
};

/**
 * The core's decision as the SDK types it. Its permission updates are the SDK's own
 * suggestions, passed through the core untouched.
 */
const sdkDecision = (decision: ToolDecision) =>
  decision.behavior === "allow"
    ? {
      behavior: "allow" as const,
      updatedInput: decision.updatedInput,
      ...(decision.updatedPermissions === undefined
        ? {}
        : { updatedPermissions: [...decision.updatedPermissions] as Array<PermissionUpdate> }),
    }
    : { behavior: "deny" as const, message: decision.message };
