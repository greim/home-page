import { assertEquals } from "@std/assert";
import { Effect, Schema } from "effect";
import {
  type CallResult,
  handleMessage,
  inputSchemaOf,
  type ListedTool,
  resultText,
} from "./agent-tool-protocol.ts";

const tools: ReadonlyArray<ListedTool> = [
  { name: "count", description: "Counts rows", inputSchema: { type: "object" } },
];

const run = (message: unknown, result: CallResult = { text: "3", isError: false }) => {
  const calls: Array<[string, unknown]> = [];
  const response = Effect.runSync(
    handleMessage(message, tools, (name, args) =>
      Effect.sync(() => {
        calls.push([name, args]);
        return result;
      })),
  );
  return { response, calls };
};

Deno.test("initialize answers with the client's protocol version and a tools capability", () => {
  const { response } = run({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26" },
  });
  assertEquals(response, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "widget-tools", version: "1" },
    },
  });
});

Deno.test("notifications get no response", () => {
  assertEquals(run({ jsonrpc: "2.0", method: "notifications/initialized" }).response, null);
});

Deno.test("tools are listed, and called by name", () => {
  assertEquals(run({ jsonrpc: "2.0", id: 2, method: "tools/list" }).response, {
    jsonrpc: "2.0",
    id: 2,
    result: { tools },
  });
  const called = run({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "count", arguments: { file: "a.csv" } },
  });
  assertEquals(called.calls, [["count", { file: "a.csv" }]]);
  assertEquals(called.response, {
    jsonrpc: "2.0",
    id: 3,
    result: { content: [{ type: "text", text: "3" }] },
  });
});

Deno.test("a failed call is reported as an error result, for the agent to see", () => {
  const failed = run(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "count" } },
    { text: "No such file", isError: true },
  );
  assertEquals(failed.response, {
    jsonrpc: "2.0",
    id: 4,
    result: { content: [{ type: "text", text: "No such file" }], isError: true },
  });
});

Deno.test("unknown tools, methods and malformed messages are errors", () => {
  const code = (message: unknown) =>
    (run(message).response as { error?: { code: number } }).error?.code;
  assertEquals(
    code({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "x" } }),
    -32602,
  );
  assertEquals(code({ jsonrpc: "2.0", id: 6, method: "tools/call", params: 7 }), -32602);
  assertEquals(code({ jsonrpc: "2.0", id: 7, method: "resources/list" }), -32601);
  assertEquals(code({ hello: true }), -32600);
  assertEquals(run({ jsonrpc: "2.0", id: 8, method: "ping" }).response, {
    jsonrpc: "2.0",
    id: 8,
    result: {},
  });
});

Deno.test("a tool's result is text as it is, and anything else as JSON", () => {
  assertEquals(resultText("done"), "done");
  assertEquals(resultText({ rows: 2 }), '{\n  "rows": 2\n}');
});

Deno.test("a tool's input is an object schema, even when it takes nothing", () => {
  assertEquals(inputSchemaOf(Schema.Struct({})), {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
  });
  const counted = inputSchemaOf(Schema.Struct({ n: Schema.Number })) as { type: string };
  assertEquals(counted.type, "object");
});
