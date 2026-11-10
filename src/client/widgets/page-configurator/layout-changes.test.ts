import { assertEquals } from "@std/assert";
import { emptyLayout, type Layout, newColumn, type Widget } from "../../../common/model.ts";
import { describeChanges, newLinks } from "./layout-changes.ts";

const bookmarks = (id: string, heading: string, urls: ReadonlyArray<string> = []): Widget => ({
  id,
  is: "bookmarks",
  config: { heading, items: urls.map((url) => ({ title: url, url })) },
});

const column = (id: string, heading: string, widgets: ReadonlyArray<Widget> = []) => ({
  ...newColumn(id, "LuStar"),
  heading,
  widgets,
});

const before: Layout = {
  ...emptyLayout,
  columns: [
    column("a", "News", [bookmarks("w1", "Papers", ["https://a.test"]), {
      id: "w2",
      is: "clock",
      config: {},
    }]),
    column("b", "Music"),
  ],
};

Deno.test("an unchanged layout has no changes", () => {
  assertEquals(describeChanges(before, before), []);
  assertEquals(newLinks(before, before), []);
});

Deno.test("columns added, removed, renamed, hidden, recolored, given icons and reordered", () => {
  const [news, music] = before.columns;
  if (news === undefined || music === undefined) throw new Error("no columns");
  const after: Layout = {
    ...before,
    columns: [
      { ...column("c", ""), hidden: true },
      { ...news, heading: "Headlines", hidden: true, color: { c: 0.02, h: 250 }, icon: "LuSun" },
    ],
  };
  assertEquals(describeChanges(before, after), [
    "Removed column “Music”",
    "Added column “Untitled”",
    "Renamed column “News” to “Headlines”",
    "Hid column “Headlines”",
    "Changed the color of column “Headlines”",
    "Changed the icon of column “Headlines”",
  ]);
  const swapped: Layout = { ...before, columns: [{ ...music, hidden: true }, news] };
  assertEquals(describeChanges(swapped, { ...before, columns: [music, news] }), [
    "Showed column “Music”",
  ]);
  assertEquals(describeChanges(before, swapped), [
    "Hid column “Music”",
    "Reordered the columns",
  ]);
});

Deno.test("widgets added, removed, moved, reordered and changed", () => {
  const after: Layout = {
    ...before,
    columns: [
      column("a", "News", [
        { id: "w2", is: "clock", config: { heading: "Time" } },
        bookmarks("w3", "Sites", ["https://b.test", " https://a.test"]),
      ]),
      column("b", "Music", [bookmarks("w1", "Papers", ["https://a.test"])]),
    ],
  };
  assertEquals(describeChanges(before, after), [
    "Changed the settings of clock “Time”",
    "Added bookmarks “Sites” to column “News”",
    "Moved bookmarks “Papers” from column “News” to “Music”",
  ]);
  assertEquals(newLinks(before, after), ["https://b.test"]);
  const reordered: Layout = {
    ...before,
    columns: [column("a", "News", [...(before.columns[0]?.widgets ?? [])].reverse()), {
      ...column("b", "Music"),
    }],
  };
  assertEquals(describeChanges(before, reordered), ["Reordered the widgets in column “News”"]);
  const removed: Layout = { ...before, columns: [column("a", "News"), column("b", "Music")] };
  assertEquals(describeChanges(before, removed), [
    "Removed bookmarks “Papers” from column “News”",
    "Removed a clock widget from column “News”",
  ]);
});

Deno.test("the schedule's changes are described", () => {
  const after: Layout = {
    ...before,
    schedule: { startOfDay: "08:00", endOfDay: "16:00", weekend: { is: "none" } },
  };
  assertEquals(describeChanges(before, after), [
    "Your day now runs from 08:00 to 16:00",
    "You now have no weekend",
  ]);
  const fridays: Layout = {
    ...before,
    schedule: { ...before.schedule, weekend: { is: "days", days: ["friday", "saturday"] } },
  };
  assertEquals(describeChanges(before, fridays), ["Your weekend is now friday and saturday"]);
});
