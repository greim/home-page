import { assertEquals } from "@std/assert";
import { graphemeLines } from "./graphemes.ts";

Deno.test("graphemeLines keeps multi-code-point characters whole", () => {
  assertEquals(graphemeLines("a👍🏽é"), [["a", "👍🏽", "é"]]);
});

Deno.test("graphemeLines splits on newlines", () => {
  assertEquals(graphemeLines("ab\n\nc"), [["a", "b"], [], ["c"]]);
});
