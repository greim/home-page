import { defaultColumnColor } from "./column-color.ts";
import { defaultSchedule } from "./day-cycle.ts";

const red = { c: 0.1, h: 25 };
import { assertEquals } from "@std/assert";
import { applyAction } from "./layout-ops.ts";
import {
  type Column,
  emptyLayout,
  type Layout,
  newColumn,
  newWidget,
  type Widget,
} from "./model.ts";

const column = (id: string, widgets: ReadonlyArray<Widget> = []): Column => ({
  ...newColumn(id, "LuStar"),
  widgets,
});

const layout = (...columns: ReadonlyArray<Column>): Layout => ({
  version: 1,
  schedule: defaultSchedule,
  columns,
});

const ids = (l: Layout) => l.columns.map((c) => c.id);
const widgetIds = (l: Layout, columnId: string) =>
  l.columns.find((c) => c.id === columnId)?.widgets.map((w) => w.id);

/** A widget type, as the registry lists it. */
const type = (id: string) => ({ id, defaultConfig: {} });

const bookmarks: Widget = {
  is: "bookmarks",
  id: "w1",
  config: { heading: "Links", items: [] },
};

Deno.test("replace-layout swaps in the new layout", () => {
  const layout = { ...emptyLayout, columns: [] };
  assertEquals(applyAction(emptyLayout, { is: "replace-layout", layout }), layout);
});

Deno.test("add-column prepends, inserts, and appends", () => {
  let l = applyAction(emptyLayout, {
    is: "add-column",
    index: 0,
    column: column("b"),
  });
  l = applyAction(l, { is: "add-column", index: 0, column: column("a") });
  l = applyAction(l, { is: "add-column", index: 2, column: column("d") });
  l = applyAction(l, { is: "add-column", index: 2, column: column("c") });
  assertEquals(ids(l), ["a", "b", "c", "d"]);
});

Deno.test("rename-column changes only the target heading", () => {
  const l = applyAction(layout(column("a"), column("b")), {
    is: "rename-column",
    columnId: "b",
    heading: "Bee",
  });
  assertEquals(l.columns.map((c) => c.heading), ["New Column", "Bee"]);
});

Deno.test("remove-column removes the column", () => {
  const l = applyAction(layout(column("a"), column("b")), {
    is: "remove-column",
    columnId: "a",
  });
  assertEquals(ids(l), ["b"]);
});

Deno.test("move-column reorders columns", () => {
  const l = applyAction(layout(column("a"), column("b"), column("c")), {
    is: "move-column",
    columnId: "a",
    toIndex: 1,
  });
  assertEquals(ids(l), ["b", "a", "c"]);
});

Deno.test("set-column-hidden hides and shows", () => {
  const hidden = applyAction(layout(column("a")), {
    is: "set-column-hidden",
    columnId: "a",
    hidden: true,
  });
  assertEquals(hidden.columns.at(0)?.hidden, true);
  const shown = applyAction(hidden, {
    is: "set-column-hidden",
    columnId: "a",
    hidden: false,
  });
  assertEquals(shown.columns.at(0)?.hidden, false);
});

Deno.test("set-column-icon changes only the target column", () => {
  const l = applyAction(layout(column("a"), column("b")), {
    is: "set-column-icon",
    columnId: "a",
    icon: "LuHouse",
  });
  assertEquals(l.columns.map((c) => c.icon), ["LuHouse", "LuStar"]);
});

Deno.test("set-column-color changes only the target column", () => {
  const l = applyAction(layout(column("a"), column("b")), {
    is: "set-column-color",
    columnId: "b",
    color: red,
  });
  assertEquals(l.columns.map((c) => c.color), [defaultColumnColor, red]);
});

Deno.test("edit-column swaps in the edited column and appends sent widgets", () => {
  const snippets = newWidget(type("snippets"), "s");
  const start = layout(
    column("a", [bookmarks, snippets]),
    column("b", [newWidget(type("form-grid"), "g")]),
  );
  const l = applyAction(start, {
    is: "edit-column",
    column: { ...column("a", [snippets]), heading: "Edited", color: red },
    sent: [{ toColumnId: "b", widget: bookmarks }],
  });
  assertEquals(l.columns.map((c) => [c.heading, c.color]), [
    ["Edited", red],
    ["New Column", defaultColumnColor],
  ]);
  assertEquals(widgetIds(l, "a"), ["s"]);
  assertEquals(widgetIds(l, "b"), ["g", "w1"]);
});

Deno.test("edit-column keeps widgets sent to a missing column", () => {
  const l = applyAction(layout(column("a", [bookmarks])), {
    is: "edit-column",
    column: column("a"),
    sent: [{ toColumnId: "gone", widget: bookmarks }],
  });
  assertEquals(widgetIds(l, "a"), ["w1"]);
});

Deno.test("edit-column is a no-op for an unknown column", () => {
  const l = layout(column("a"));
  assertEquals(applyAction(l, { is: "edit-column", column: column("nope"), sent: [] }), l);
});

Deno.test("set-widget-config replaces only that widget's config", () => {
  const other = { ...bookmarks, id: "w2" };
  const l = applyAction(layout(column("a", [bookmarks, other])), {
    is: "set-widget-config",
    columnId: "a",
    widgetId: "w1",
    config: { items: ["changed"] },
  });
  assertEquals(l.columns.at(0)?.widgets.map((w) => w.config), [
    { items: ["changed"] },
    bookmarks.config,
  ]);
});

Deno.test("discard-untouched-columns removes only listed columns left as created", () => {
  const renamed = { ...column("renamed"), heading: "Work" };
  const filled = column("filled", [newWidget(type("bookmarks"), "w")]);
  const start = layout(column("fresh"), renamed, filled, column("unlisted"));
  const result = applyAction(start, {
    is: "discard-untouched-columns",
    columnIds: ["fresh", "renamed", "filled", "missing"],
  });
  assertEquals(ids(result), ["renamed", "filled", "unlisted"]);
});
