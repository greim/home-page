import { assertEquals } from "@std/assert";
import {
  activityLabel,
  historySignals,
  maxToolText,
  parseAgentMessage,
  userText,
} from "./agent-output.ts";

const root = "/repo";
const parse = (message: unknown) => parseAgentMessage(root, message);

Deno.test("init messages give the session id and mode; status messages, a changed mode", () => {
  assertEquals(
    parse({ type: "system", subtype: "init", session_id: "s1", tools: [] }),
    [{ is: "session", sessionId: "s1" }],
  );
  assertEquals(
    parse({ type: "system", subtype: "init", session_id: "s1", permissionMode: "default" }),
    [{ is: "session", sessionId: "s1" }, { is: "mode", mode: "default" }],
  );
  assertEquals(
    parse({ type: "system", subtype: "status", status: null, permissionMode: "plan" }),
    [{ is: "mode", mode: "plan" }],
  );
});

Deno.test("streamed text comes as deltas, the main agent's only", () => {
  const delta = (parent: string | null) => ({
    type: "stream_event",
    parent_tool_use_id: parent,
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
  });
  assertEquals(parse(delta(null)), [{ is: "delta", text: "Hel" }]);
  assertEquals(parse(delta("toolu_1")), []);
  assertEquals(parse({ type: "stream_event", event: { type: "message_start" } }), []);
});

Deno.test("tool results come back by tool call, as text, clipped", () => {
  const result = (content: unknown, isError?: boolean) => ({
    type: "user",
    parent_tool_use_id: null,
    message: {
      content: [{ type: "tool_result", tool_use_id: "t1", content, is_error: isError }],
    },
  });
  assertEquals(parse(result("ok")), [{
    is: "tool-result",
    toolUseId: "t1",
    text: "ok",
    isError: false,
  }]);
  assertEquals(parse(result([{ type: "text", text: "a" }, { type: "image" }], true)), [{
    is: "tool-result",
    toolUseId: "t1",
    text: "a\n[image]",
    isError: true,
  }]);
  const long = parse(result("x".repeat(maxToolText + 5))).at(0);
  assertEquals(long?.is === "tool-result" ? long.text.length : 0, maxToolText + 1);
  // Live, the user's own messages aren't relayed: the client shows what it sent.
  assertEquals(
    parse({ type: "user", parent_tool_use_id: null, message: { content: "Hi" } }),
    [],
  );
});

Deno.test("assistant messages give their text and tool calls, skipping thinking and blank text", () => {
  const message = {
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "  Done!\n" },
        { type: "text", text: "  " },
        { type: "tool_use", id: "t", name: "Read", input: { file_path: "/repo/data/layout.json" } },
      ],
    },
  };
  assertEquals(parse(message), [
    { is: "text", text: "Done!" },
    {
      is: "tool",
      toolUseId: "t",
      name: "Read",
      label: "Reading data/layout.json",
      input: { file_path: "/repo/data/layout.json" },
    },
  ]);
});

Deno.test("a subagent's messages are left out", () => {
  assertEquals(
    parse({
      type: "assistant",
      parent_tool_use_id: "toolu_1",
      message: { content: [{ type: "text", text: "inner" }] },
    }),
    [],
  );
});

Deno.test("results say whether the run succeeded, and what it cost", () => {
  assertEquals(
    parse({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "ok",
      total_cost_usd: 0.25,
    }),
    [{ is: "result", ok: true, message: "ok", costUsd: 0.25 }],
  );
  assertEquals(
    parse({ type: "result", subtype: "error_max_turns", is_error: true }),
    [{
      is: "result",
      ok: false,
      message: "The assistant took too many steps and stopped.",
      costUsd: null,
    }],
  );
  assertEquals(
    parse({ type: "result", subtype: "error_during_execution", is_error: true }),
    [{
      is: "result",
      ok: false,
      message: "The assistant stopped before finishing.",
      costUsd: null,
    }],
  );
  assertEquals(
    parse({ type: "result", subtype: "error_other", is_error: true }),
    [{ is: "result", ok: false, message: "error_other", costUsd: null }],
  );
  assertEquals(
    parse({ type: "result", subtype: "success", is_error: true, result: "Boom" }),
    [{ is: "result", ok: false, message: "Boom", costUsd: null }],
  );
});

Deno.test("other and malformed messages are ignored", () => {
  for (
    const message of [
      null,
      "not an object",
      { type: "user", parent_tool_use_id: "toolu_1", message: { content: [] } },
      { type: "system", subtype: "thinking_tokens" },
      { type: "rate_limit_event" },
      { type: "assistant", message: {} },
    ]
  ) {
    assertEquals(parse(message), [], JSON.stringify(message));
  }
});

Deno.test("activity labels describe web, file and shell tools, with paths relative to the repo", () => {
  const cases: ReadonlyArray<[string, Record<string, unknown>, string]> = [
    ["WebSearch", { query: "stock quote API" }, "Searching the web for “stock quote API”"],
    ["WebFetch", { url: "https://example.com/docs" }, "Reading https://example.com/docs"],
    [
      "Edit",
      { file_path: "/repo/src/client/widgets/clock/main.tsx" },
      "Editing src/client/widgets/clock/main.tsx",
    ],
    ["Write", { file_path: "/elsewhere/notes.md" }, "Editing /elsewhere/notes.md"],
    ["Glob", { pattern: "**/*.ts" }, "Looking for files matching **/*.ts"],
    ["Grep", { pattern: "Layout" }, "Searching files for “Layout”"],
    [
      "Bash",
      { command: "deno task build", description: "Build the app" },
      "Running: Build the app",
    ],
    ["Bash", { command: "git status" }, "Running git status"],
    ["Read", {}, "Reading ?"],
    ["Mystery", {}, "Using Mystery"],
  ];
  for (const [name, input, label] of cases) {
    assertEquals(activityLabel(root, name, input), label);
  }
  assertEquals(activityLabel("/repo/", "Read", { file_path: "/repo/a.ts" }), "Reading a.ts");
});

Deno.test("a saved transcript replays the user's messages too, without the app's notes", () => {
  const user = (content: unknown) => ({
    type: "user",
    parent_tool_use_id: null,
    message: { role: "user", content },
  });
  const signals = historySignals(root, [
    user("[app note] the layout was refreshed.\n\nAdd a column"),
    {
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "On it" }] },
    },
    user([{ type: "text", text: "Plain" }]),
    user("[app] data/assistant/layout.json was NOT applied"),
    { type: "system", subtype: "init", session_id: "s1" },
    { type: "result", subtype: "success", is_error: false },
  ]);
  assertEquals(signals, [
    { is: "user", text: "Add a column" },
    { is: "text", text: "On it" },
    { is: "user", text: "Plain" },
  ]);
});

Deno.test("the user's text is what follows the app's notes; the app's own messages have none", () => {
  assertEquals(userText("Hi"), "Hi");
  assertEquals(userText("[app note] a\n[app note] b\n\nHi\n\nthere"), "Hi\n\nthere");
  assertEquals(userText("[app] rejected\n\ndiagnostic"), null);
  assertEquals(userText("  "), null);
  assertEquals(userText("[app note] only a note"), null);
});
