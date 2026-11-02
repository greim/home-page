import { assertEquals } from "@std/assert";
import { type Column, newColumn } from "../common/model.ts";
import {
  carousel,
  clampOffset,
  frameHeight,
  inView,
  leadingColumnId,
  nearestGap,
  offsetOfColumn,
  revealOffset,
  showNavigator,
  sideOf,
  sideShift,
  stripSlots,
} from "./carousel.ts";

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

Deno.test("stripSlots shows hidden columns in admin mode", () => {
  assertEquals(describe(stripSlots(cols(4, [1]), true)), ["c0@0", "c1@1", "c2@2", "c3@3"]);
  assertEquals(describe(stripSlots(cols(2, [1]), true)), ["c0@0", "c1@1", "+@2"]);
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

Deno.test("carousel keeps the view filled when columns are removed", () => {
  // Scrolled right, then the last column is deleted.
  assertEquals(carousel(1, stripSlots(cols(4), true)), { offset: 0, navigable: false });
  assertEquals(carousel(2, stripSlots(cols(5), true)), { offset: 1, navigable: true });
  assertEquals(carousel(1, stripSlots(cols(3), true)), { offset: 0, navigable: false });
});

Deno.test("showNavigator shows it in admin mode or when slots overflow", () => {
  const fits = { offset: 0, navigable: false };
  const overflows = { offset: 0, navigable: true };
  assertEquals(showNavigator(fits, false), false);
  assertEquals(showNavigator(fits, true), true);
  assertEquals(showNavigator(overflows, false), true);
});

Deno.test("sideOf and sideShift place thumbnails around the outline", () => {
  assertEquals([0, 1, 4, 5].map((i) => sideOf(1, i)), ["left", "in", "in", "right"]);
  assertEquals(["left", "in", "right"].map((s) => sideShift(s as "left")), [-1, 0, 1]);
});

Deno.test("nearestGap picks the closest drop target", () => {
  const targets = [{ gap: 0, x: 10 }, { gap: 1, x: 50 }, { gap: 2, x: 90 }];
  assertEquals(nearestGap(targets, -100), 0);
  assertEquals(nearestGap(targets, 60), 1);
  assertEquals(nearestGap(targets, 75), 2);
  assertEquals(nearestGap([], 75), null);
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

Deno.test("frameHeight leaves room for the margins and anything else shown", () => {
  const margins = { top: "4px", bottom: "8px" };
  assertEquals(frameHeight(margins, []), "calc(100% - 4px - 8px)");
  assertEquals(
    frameHeight(margins, ["40px", "(8px + 5px)"]),
    "calc(100% - 4px - 8px - 40px - (8px + 5px))",
  );
});

Deno.test("leadingColumnId names the column at the view's left edge", () => {
  assertEquals(leadingColumnId(2, stripSlots(cols(6), false)), "c2");
  assertEquals(leadingColumnId(0, stripSlots(cols(0), false)), null);
});

Deno.test("offsetOfColumn finds a remembered column, or starts at the beginning", () => {
  assertEquals(offsetOfColumn("c3", stripSlots(cols(6), false)), 3);
  assertEquals(offsetOfColumn("c3", stripSlots(cols(6, [1]), false)), 2);
  assertEquals(offsetOfColumn("c1", stripSlots(cols(6, [1]), false)), 0);
  assertEquals(offsetOfColumn("gone", stripSlots(cols(6), false)), 0);
  assertEquals(offsetOfColumn(null, stripSlots(cols(6), false)), 0);
});
