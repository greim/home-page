import { assertEquals, assertStringIncludes } from "@std/assert";
import { Schema } from "effect";
import { agentUrl, readAgentResponse } from "./agents.ts";

const Output = Schema.Struct({ count: Schema.Number });

Deno.test("an agent runs at the assistant service, on the page's host", () => {
  assertEquals(
    agentUrl({ protocol: "https:", hostname: "localhost" }, "9443", "grammar-check", "check"),
    "https://localhost:9443/api/widget-agents/grammar-check/check",
  );
});

Deno.test("an answer is decoded with the agent's output schema", () => {
  assertEquals(
    readAgentResponse(200, JSON.stringify({ output: { count: 2 }, costUsd: 0.01 }), Output),
    { ok: true, value: { count: 2 }, costUsd: 0.01 },
  );
});

Deno.test("a failure says why", () => {
  const message = (status: number, body: string) => {
    const result = readAgentResponse(status, body, Output);
    return result.ok ? "ok" : result.errorMessage;
  };
  assertEquals(message(404, "There's no agent"), "There's no agent");
  assertEquals(message(500, " "), "The assistant service answered 500.");
  assertStringIncludes(message(200, "not json"), "wasn't understood");
  assertStringIncludes(message(200, JSON.stringify({ output: {}, costUsd: 0 })), "didn't fit");
});
