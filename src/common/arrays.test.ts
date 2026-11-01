import { assertEquals } from "@std/assert";
import { gapToIndex, insertAt, mapWhere, moveWhere, removeWhere } from "./arrays.ts";

Deno.test("insertAt inserts at the start, middle, and end", () => {
  assertEquals(insertAt([1, 2], 0, 0), [0, 1, 2]);
  assertEquals(insertAt([1, 3], 1, 2), [1, 2, 3]);
  assertEquals(insertAt([1, 2], 2, 3), [1, 2, 3]);
});

Deno.test("insertAt clamps out-of-range indexes", () => {
  assertEquals(insertAt([1], -5, 0), [0, 1]);
  assertEquals(insertAt([1], 99, 2), [1, 2]);
});

Deno.test("moveWhere moves an item forward and backward", () => {
  assertEquals(moveWhere(["a", "b", "c"], (x) => x === "a", 2), [
    "b",
    "c",
    "a",
  ]);
  assertEquals(moveWhere(["a", "b", "c"], (x) => x === "c", 0), [
    "c",
    "a",
    "b",
  ]);
});

Deno.test("moveWhere returns the input when nothing matches", () => {
  const input = ["a"];
  assertEquals(moveWhere(input, (x) => x === "z", 0) === input, true);
});

Deno.test("mapWhere only maps matching items", () => {
  assertEquals(mapWhere([1, 2, 3], (x) => x > 1, (x) => x * 10), [1, 20, 30]);
});

Deno.test("removeWhere removes matching items", () => {
  assertEquals(removeWhere([1, 2, 3], (x) => x === 2), [1, 3]);
});

Deno.test("gapToIndex accounts for the moved item's own removal", () => {
  const drop = (gap: number) => moveWhere(["a", "b", "c"], (x) => x === "b", gapToIndex(1, gap));
  assertEquals(drop(0), ["b", "a", "c"]);
  assertEquals(drop(1), ["a", "b", "c"]);
  assertEquals(drop(2), ["a", "b", "c"]);
  assertEquals(drop(3), ["a", "c", "b"]);
});
