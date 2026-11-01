import { assertEquals } from "@std/assert";
import { graphemeLines, isCopyableChar } from "./graphemes.ts";

Deno.test("graphemeLines keeps multi-code-point characters whole", () => {
  assertEquals(graphemeLines("a👍🏽é"), [["a", "👍🏽", "é"]]);
});

Deno.test("graphemeLines splits on newlines", () => {
  assertEquals(graphemeLines("ab\n\nc"), [["a", "b"], [], ["c"]]);
});

Deno.test("isCopyableChar excludes whitespace only", () => {
  for (const char of ["←", "a", "👍🏽", "."]) assertEquals(isCopyableChar(char), true, char);
  for (const char of [" ", "\t", "\u00a0", "\u3000"]) assertEquals(isCopyableChar(char), false);
});
