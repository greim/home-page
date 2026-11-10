import { assertEquals } from "@std/assert";
import { requestChange, takeRequest } from "./request-live.ts";

Deno.test("a widget's request is taken once, and the latest replaces one not yet taken", () => {
  assertEquals(takeRequest("w1"), null);
  requestChange("w1", "Add a news column");
  requestChange("w1", "Add a music column");
  requestChange("w2", "Make it blue");
  assertEquals(takeRequest("w1"), "Add a music column");
  assertEquals(takeRequest("w1"), null);
  assertEquals(takeRequest("w2"), "Make it blue");
});
