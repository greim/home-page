/**
 * The commit message model, through the Claude Agent SDK: a small model, no tools, none of the
 * user's Claude Code setup, answering in a JSON shape (see the `widget-agents` skill for why
 * each option). Calls a paid API, so it has no automated test: see "Checking it by hand" below.
 *
 * Checking it by hand: start the assistant service, then in a browser console on the page
 * `fetch("https://localhost:9443/api/widget-apis/commit-message/suggest", {method: "POST",
 * body: JSON.stringify({caller: {widgetType: "page", widgetId: "p"}, input: {diff: "..."}})})`.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Effect, JSONSchema } from "effect";
import { Answer, CommitMessageIo } from "./commit-message.ts";
import { IoError } from "./http.ts";

/** A small, quick model: the task is one line from a short diff. */
export const commitMessageModel = "claude-haiku-5-5";
const timeoutMs = 60_000;

const schema = JSONSchema.make(Answer);

/** `runsDir` is a folder it may write to (under data/): each run gets an empty one of its own. */
export const commitMessageIoLive = (runsDir: string) =>
  CommitMessageIo.of({
    ask: ({ instructions, prompt }) =>
      Effect.tryPromise({
        try: async () => {
          await Deno.mkdir(runsDir, { recursive: true });
          const cwd = await Deno.makeTempDir({ dir: runsDir, prefix: "run-" });
          const abortController = new AbortController();
          const timer = setTimeout(() => abortController.abort(), timeoutMs);
          try {
            const messages: Array<unknown> = [];
            for await (
              const message of query({
                prompt,
                options: {
                  cwd,
                  model: commitMessageModel,
                  tools: [],
                  allowedTools: [],
                  mcpServers: {},
                  strictMcpConfig: true,
                  settingSources: [],
                  skills: [],
                  extraArgs: { "disable-slash-commands": null },
                  systemPrompt: instructions,
                  permissionMode: "dontAsk",
                  canUseTool: () => Promise.resolve({ behavior: "deny", message: "No tools." }),
                  persistSession: false,
                  outputFormat: {
                    type: "json_schema",
                    schema: schema as unknown as Record<string, unknown>,
                  },
                  maxTurns: 4,
                  maxBudgetUsd: 0.1,
                  abortController,
                },
              })
            ) messages.push(message);
            return messages;
          } finally {
            clearTimeout(timer);
            await Deno.remove(cwd, { recursive: true });
          }
        },
        catch: (cause) => new IoError({ cause }),
      }),
  });
