import { assertEquals } from "@std/assert";
import { type Column, newColumn } from "../common/model.ts";
import { carousel, clampOffset, inView, revealOffset, stripSlots } from "./carousel.ts";

const cols = (n: number, hidden: ReadonlyArray<number> = []): ReadonlyArray<Column> =>
  Array.from(
    { length: n },
    (_, i) => ({ ...newColumn(`c${i}`, "LuStar"), hidden: hidden.includes(i) }),
  );

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

Deno.test("carousel is navigable only when slots overflow the view", () => {
  assertEquals(carousel(0, stripSlots(cols(3), false)), { offset: 0, navigable: false });
  assertEquals(carousel(0, stripSlots(cols(4), false)), { offset: 0, navigable: false });
  assertEquals(carousel(1, stripSlots(cols(6), false)), { offset: 1, navigable: true });
  assertEquals(carousel(9, stripSlots(cols(6), false)), { offset: 2, navigable: true });
});

Deno.test("carousel keeps the add-column slot out of a view columns could fill", () => {
  // Five columns plus the add slot, scrolled right; delete the last column.
  assertEquals(carousel(1, stripSlots(cols(4), true)), { offset: 0, navigable: true });
  assertEquals(carousel(2, stripSlots(cols(5), true)), { offset: 1, navigable: true });
});

Deno.test("inView covers the four slots from the offset", () => {
  assertEquals([0, 1, 2, 3, 4, 5, 6].map((i) => inView(2, i)), [
    false,
    false,
    true,
    true,
    true,
    true,
    false,
  ]);
});

Deno.test("revealOffset slides a hidden slot just into view on its side", () => {
  assertEquals(revealOffset(3, 1), 1); // left: becomes the leftmost
  assertEquals(revealOffset(3, 2), 2);
  assertEquals(revealOffset(0, 4), 1); // right: becomes the rightmost
  assertEquals(revealOffset(0, 8), 5);
  assertEquals(revealOffset(2, 2), 2); // already in view: no change
  assertEquals(revealOffset(2, 5), 2);
});
