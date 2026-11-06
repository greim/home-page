/**
 * Imperative shell for the admin assistant: the real workspace files, a real
 * `claude` process, and real `deno` commands checking its work, behind the
 * {@link AssistantIo} pipes.
 */
import { encodeHex } from "@std/encoding/hex";
import { Effect, Stream } from "effect";
import {
  agentArgs,
  agentAuth,
  type AgentSettings,
  workspaceLayoutName,
  workspaceScreenshotName,
} from "./assistant-agent.ts";
import { AssistantIo } from "./assistant.ts";
import { IoError } from "./http.ts";
import {
  type CheckSettings,
  layoutStep,
  runSteps,
  type Step,
  type StepResult,
  widgetSteps,
} from "./widget-checks.ts";

export type AssistantSettings = AgentSettings & CheckSettings & {
  /** The widget build's registry.json. */
  readonly registryFile: string;
  /** Most time one check may take before it's stopped and counted as failed. */
  readonly stepTimeoutMs: number;
  /** The user's Claude Code settings.json, for how the agent signs in. */
  readonly userSettingsFile: string;
};

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

/** Spawns the agent with the prompt on stdin. Aborting the controller kills it. */
const spawn = (
  command: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>>,
  cwd: string,
  prompt: string,
) =>
  Effect.try({
    try: () => {
      const controller = new AbortController();
      const child = new Deno.Command(command, {
        args: [...args],
        env: { ...env },
        cwd,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
        signal: controller.signal,
      }).spawn();
      return { controller, child };
    },
    catch: (cause) => new IoError({ cause }),
  }).pipe(
    Effect.tap(({ child }) => attempt(() => writeAll(child.stdin, prompt))),
  );

/** Read each turn, so a change to the user's sign-in applies without a restart. */
const readAuth = (file: string) =>
  Effect.promise(async () => {
    try {
      return agentAuth(JSON.parse(await Deno.readTextFile(file)));
    } catch {
      // Missing or unreadable: claude signs in however it would by default.
      return agentAuth(null);
    }
  });

const writeAll = async (stdin: WritableStream<Uint8Array>, text: string) => {
  const writer = stdin.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
};

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

/** Every file under `dir`, recursively, as paths relative to it; none if it's missing. */
const listFiles = async (dir: string, prefix = ""): Promise<Array<string>> => {
  const entries = await Array.fromAsync(Deno.readDir(`${dir}/${prefix}`));
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory
        ? listFiles(dir, `${prefix}${e.name}/`)
        : Promise.resolve([`${prefix}${e.name}`])
    ),
  );
  return nested.flat();
};

/** A hash of the files' paths and contents. */
const hashFiles = async (dir: string, files: ReadonlyArray<string>): Promise<string> => {
  const parts = await Promise.all(
    [...files].sort().map(async (file) => {
      const contents = await crypto.subtle.digest("SHA-256", await Deno.readFile(`${dir}/${file}`));
      return `${file}\0${encodeHex(contents)}\n`;
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("")));
  return encodeHex(digest);
};

export const assistantIoLive = (
  settings: AssistantSettings,
): Effect.Effect<AssistantIo["Type"]> =>
  Effect.map(Effect.makeSemaphore(1), (turnLock) => {
    const layoutFile = `${settings.workspaceDir}/${workspaceLayoutName}`;
    const screenshotFile = `${settings.workspaceDir}/${workspaceScreenshotName}`;
    return AssistantIo.of({
      turnLock,
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
      fingerprintWidgets: attempt(() => listFiles(settings.widgetsDir)).pipe(
        Effect.catchIf((e) => e.cause instanceof Deno.errors.NotFound, () => Effect.succeed([])),
        Effect.flatMap((files) => attempt(() => hashFiles(settings.widgetsDir, files))),
      ),
      checkWidgets: runSteps(widgetSteps(settings), runStep(settings)),
      checkWorkspaceLayout: runSteps([layoutStep(settings, layoutFile)], runStep(settings)),
      startAgent: (prompt, sessionId, registry) =>
        Effect.acquireRelease(
          readAuth(settings.userSettingsFile).pipe(Effect.flatMap((auth) =>
            spawn(
              settings.claudePath,
              agentArgs(settings, sessionId, registry, auth),
              auth.env,
              settings.workspaceDir,
              prompt,
            )
          )),
          ({ controller }) => Effect.sync(() => controller.abort()),
        ).pipe(Effect.map(({ child }) => {
          // Read stderr as it comes, so a chatty agent can't fill the pipe and stall.
          const stderr = new Response(child.stderr).text();
          return {
            stdout: Stream.fromReadableStream({
              evaluate: () => child.stdout.pipeThrough(new TextDecoderStream()),
              onError: (cause) => new IoError({ cause }),
            }),
            exit: attempt(async () => ({ code: (await child.status).code, stderr: await stderr })),
          };
        })),
    });
  });
