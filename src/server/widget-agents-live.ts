/**
 * Imperative shell for widget agents (see widget-agents.ts): the registry file, a
 * temporary folder per run, and Claude Code through the Agent SDK.
 */
import { type Options, query } from "@anthropic-ai/claude-agent-sdk";
import { Effect } from "effect";
import { IoError } from "./http.ts";
import { type AgentOptions, WidgetAgentIo } from "./widget-agents.ts";

const attempt = <A>(fn: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

/** Every message a run sends; stopping it if `signal` aborts (a timeout). */
const collect = async (
  options: AgentOptions,
  prompt: string,
  signal: AbortSignal,
): Promise<ReadonlyArray<unknown>> => {
  const abortController = new AbortController();
  signal.addEventListener("abort", () => abortController.abort(), { once: true });
  const messages: Array<unknown> = [];
  for await (
    const message of query({
      prompt,
      options: {
        ...(options as unknown as Options),
        abortController,
        // A second wall: with no tools there should be nothing to ask about.
        canUseTool: () =>
          Promise.resolve({ behavior: "deny", message: "Widget agents have no tools." }),
      },
    })
  ) {
    messages.push(message);
  }
  return messages;
};

/** `runsDir` holds each run's folder (under data/, the only place the service may write). */
export const widgetAgentIoLive = (registryFile: string, runsDir: string) =>
  WidgetAgentIo.of({
    readRegistry: attempt(() => Deno.readTextFile(registryFile)),
    makeWorkdir: attempt(async () => {
      await Deno.mkdir(runsDir, { recursive: true });
      return await Deno.makeTempDir({ dir: runsDir, prefix: "run-" });
    }),
    removeWorkdir: (dir) =>
      attempt(() => Deno.remove(dir, { recursive: true })).pipe(Effect.ignore),
    query: (options, prompt) => attempt((signal) => collect(options, prompt, signal)),
  });
