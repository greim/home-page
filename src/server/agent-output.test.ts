import { assertEquals } from "@std/assert";
import { activityLabel, parseAgentLine } from "./agent-output.ts";

const line = (value: unknown) => JSON.stringify(value);

Deno.test("init lines give the session id", () => {
  assertEquals(
    parseAgentLine(line({ type: "system", subtype: "init", session_id: "s1", tools: [] })),
    [{ is: "session", sessionId: "s1" }],
  );
});

Deno.test("assistant messages give their text and tool calls, skipping thinking and blank text", () => {
  const message = {
    type: "assistant",
    message: {
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "  Done!\n" },
        { type: "text", text: "  " },
        { type: "tool_use", id: "t", name: "Read", input: { file_path: "/w/layout.json" } },
      ],
    },
  };
  assertEquals(parseAgentLine(line(message)), [
    { is: "text", text: "Done!" },
    { is: "activity", label: "Reading layout.json" },
  ]);
});

Deno.test("result lines say whether the run succeeded, and what it cost", () => {
  assertEquals(
    parseAgentLine(line({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "ok",
      total_cost_usd: 0.25,
    })),
    [{ is: "result", ok: true, message: "ok", costUsd: 0.25 }],
  );
  assertEquals(
    parseAgentLine(line({ type: "result", subtype: "error_max_turns", is_error: true })),
    [{ is: "result", ok: false, message: "error_max_turns", costUsd: null }],
  );
  assertEquals(
    parseAgentLine(line({ type: "result", subtype: "success", is_error: true, result: "Boom" })),
    [{ is: "result", ok: false, message: "Boom", costUsd: null }],
  );
});

Deno.test("other and malformed lines are ignored", () => {
  for (
    const text of [
      "",
      "not json",
      line({ type: "user", message: { content: [] } }),
      line({ type: "system", subtype: "thinking_tokens" }),
      line({ type: "rate_limit_event" }),
      line({ type: "assistant", message: {} }),
    ]
  ) {
    assertEquals(parseAgentLine(text), [], text);
  }
});

Deno.test("activity labels describe web and file tools", () => {
  const cases: ReadonlyArray<[string, Record<string, unknown>, string]> = [
    ["WebSearch", { query: "stock quote API" }, "Searching the web for “stock quote API”"],
    ["WebFetch", { url: "https://example.com/docs" }, "Reading https://example.com/docs"],
    ["Edit", { file_path: "/repo/src/client/widgets/clock/main.tsx" }, "Editing clock/main.tsx"],
    ["Edit", { file_path: "/w/layout.json" }, "Editing layout.json"],
    ["Write", { file_path: "layout.json" }, "Editing layout.json"],
    ["Glob", { pattern: "**/*.ts" }, "Looking for files matching **/*.ts"],
    ["Grep", { pattern: "Layout" }, "Searching files for “Layout”"],
    ["Read", {}, "Reading ?"],
    ["Mystery", {}, "Using Mystery"],
  ];
  for (const [name, input, label] of cases) {
    assertEquals(activityLabel(name, input), label);
  }
});
