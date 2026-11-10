import { assertEquals, assertStringIncludes } from "@std/assert";
import { Schema } from "effect";
import { readAgentResult } from "./agents.ts";

const Output = Schema.Struct({ count: Schema.Number });

Deno.test("an answer is decoded with the agent's output schema", () => {
  assertEquals(
    readAgentResult({ ok: true, value: { output: { count: 2 }, costUsd: 0.01 } }, Output),
    { ok: true, value: { count: 2 }, costUsd: 0.01 },
  );
});

Deno.test("a failure says why", () => {
  assertEquals(
    readAgentResult({ ok: false, error: { message: "There's no agent" } }, Output),
    { ok: false, errorMessage: "There's no agent" },
  );
  const misfit = readAgentResult({ ok: true, value: { output: {}, costUsd: 0 } }, Output);
  assertStringIncludes(misfit.ok ? "" : misfit.errorMessage, "didn't fit");
});
