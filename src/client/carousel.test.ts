import { assertEquals } from "@std/assert";
import { type Column, newColumn } from "../common/model.ts";
import { carousel, clampOffset, stripSlots } from "./carousel.ts";

const cols = (n: number, hidden: ReadonlyArray<number> = []): ReadonlyArray<Column> =>
  Array.from({ length: n }, (_, i) => ({ ...newColumn(`c${i}`), hidden: hidden.includes(i) }));

const describe = (slots: ReturnType<typeof stripSlots>) =>
  slots.map((s) => (s.is === "column" ? `${s.column.id}@${s.index}` : `+@${s.index}`));

Deno.test("stripSlots offers an add-column slot when columns don't fill the view", () => {
  assertEquals(describe(stripSlots([], false)), ["+@0"]);
  assertEquals(describe(stripSlots(cols(3), false)), ["c0@0", "c1@1", "c2@2", "+@3"]);
  assertEquals(describe(stripSlots(cols(4), false)), ["c0@0", "c1@1", "c2@2", "c3@3"]);
});

Deno.test("stripSlots skips hidden columns outside admin mode", () => {
  assertEquals(describe(stripSlots(cols(5, [1]), false)), [
    "c0@0",
    "c2@2",
    "c3@3",
    "c4@4",
  ]);
  assertEquals(describe(stripSlots(cols(2, [0]), false)), ["c1@1", "+@2"]);
});

Deno.test("stripSlots shows everything plus an add slot in admin mode", () => {
  assertEquals(describe(stripSlots(cols(4, [1]), true)), [
    "c0@0",
    "c1@1",
    "c2@2",
    "c3@3",
    "+@4",
  ]);
});

Deno.test("clampOffset keeps the view within bounds", () => {
  assertEquals(clampOffset(-1, 6), 0);
  assertEquals(clampOffset(1, 6), 1);
  assertEquals(clampOffset(5, 6), 2);
  assertEquals(clampOffset(3, 2), 0);
});

Deno.test("carousel reports which directions can slide", () => {
  assertEquals(carousel(0, 3), { offset: 0, canSlideLeft: false, canSlideRight: false });
  assertEquals(carousel(0, 6), { offset: 0, canSlideLeft: false, canSlideRight: true });
  assertEquals(carousel(1, 6), { offset: 1, canSlideLeft: true, canSlideRight: true });
  assertEquals(carousel(9, 6), { offset: 2, canSlideLeft: true, canSlideRight: false });
});
