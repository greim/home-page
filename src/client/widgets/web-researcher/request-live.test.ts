import { assertEquals } from "@std/assert";
import { requestTopic, takeRequest } from "./request-live.ts";

Deno.test("a widget's request is taken once, and the latest replaces one not yet taken", () => {
  assertEquals(takeRequest("w1"), null);
  requestTopic("w1", "Deno 2.9");
  requestTopic("w1", "Bun 2");
  requestTopic("w2", "Rust async");
  assertEquals(takeRequest("w1"), "Bun 2");
  assertEquals(takeRequest("w1"), null);
  assertEquals(takeRequest("w2"), "Rust async");
});
