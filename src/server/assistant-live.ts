/**
 * Imperative shell for the admin assistant: the real workspace file and a real
 * `claude` process behind the {@link AssistantIo} pipes.
 */
import { Effect, Stream } from "effect";
import { agentArgs, type AgentSettings, workspaceLayoutName } from "./assistant-agent.ts";
import { AssistantIo } from "./assistant.ts";
import { IoError } from "./http.ts";

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

/** Spawns the agent with the prompt on stdin. Aborting the controller kills it. */
const spawn = (command: string, args: ReadonlyArray<string>, cwd: string, prompt: string) =>
  Effect.try({
    try: () => {
      const controller = new AbortController();
      const child = new Deno.Command(command, {
        args: [...args],
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

const writeAll = async (stdin: WritableStream<Uint8Array>, text: string) => {
  const writer = stdin.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
};

export const assistantIoLive = (settings: AgentSettings): Effect.Effect<AssistantIo["Type"]> =>
  Effect.map(Effect.makeSemaphore(1), (turnLock) => {
    const layoutFile = `${settings.workspaceDir}/${workspaceLayoutName}`;
    return AssistantIo.of({
      turnLock,
      readWorkspaceLayout: attempt(() => Deno.readTextFile(layoutFile)),
      writeWorkspaceLayout: (text) =>
        attempt(async () => {
          await Deno.mkdir(settings.workspaceDir, { recursive: true });
          await Deno.writeTextFile(layoutFile, text);
        }),
      startAgent: (prompt, sessionId) =>
        Effect.acquireRelease(
          spawn(settings.claudePath, agentArgs(settings, sessionId), settings.workspaceDir, prompt),
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
