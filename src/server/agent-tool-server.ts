/**
 * Imperative shell of a widget's agent tools: an MCP server over stdio, started by
 * Claude Code for one run, in a Deno process allowed to read and write only the run's
 * folder (and read the source), with no network. See agent-tool-protocol.ts.
 *
 *   deno run <permissions> agent-tool-server.ts <the widget's agent-tools.ts> <run folder>
 */
import { Effect, Schema } from "effect";
import type { AgentTools, RunFolder } from "../common/agent-tools.ts";
import {
  handleMessage,
  inputSchemaOf,
  type ListedTool,
  resultText,
} from "./agent-tool-protocol.ts";

const [modulePath = "", dir = ""] = Deno.args;
const { tools } = (await import(new URL(`file://${modulePath}`).href)) as { tools: AgentTools };

const folder: RunFolder = {
  dir,
  path: (relative) => {
    const resolved = new URL(relative, `file://${dir}/`).pathname;
    if (!resolved.startsWith(`${dir}/`)) throw new Error(`${relative} is outside the run's folder`);
    return resolved;
  },
};

const listed: ReadonlyArray<ListedTool> = Object.entries(tools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: inputSchemaOf(tool.input),
}));

const call = (name: string, args: unknown) =>
  Effect.tryPromise(async () => {
    const tool = tools[name];
    if (tool === undefined) throw new Error(`There's no tool called "${name}"`);
    const input = Schema.decodeUnknownSync(tool.input)(args);
    return { text: resultText(await tool.run(input, folder)), isError: false };
  }).pipe(
    Effect.catchAll((e) =>
      Effect.succeed({
        text: e.error instanceof Error ? e.error.message : String(e.error),
        isError: true,
      })
    ),
  );

/** Stdin's lines, as they come. */
async function* lines(): AsyncGenerator<string> {
  let pending = "";
  for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
    const parts = (pending + chunk).split("\n");
    pending = parts.pop() ?? "";
    yield* parts;
  }
  if (pending !== "") yield pending;
}

const encoder = new TextEncoder();
for await (const line of lines()) {
  if (line.trim() === "") continue;
  const message = Effect.try(() => JSON.parse(line) as unknown).pipe(
    Effect.orElseSucceed(() => ({})),
  );
  const response = await Effect.runPromise(
    Effect.flatMap(message, (m) => handleMessage(m, listed, call)),
  );
  if (response !== null) await Deno.stdout.write(encoder.encode(JSON.stringify(response) + "\n"));
}
