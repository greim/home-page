import { assertEquals } from "@std/assert";
import { applyAction } from "./layout-ops.ts";
import {
  type BookmarksWidget,
  type Column,
  defaultBackground,
  defaultSkin,
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
  background: defaultBackground,
  skin: defaultSkin,
  columns,
});

const ids = (l: Layout) => l.columns.map((c) => c.id);
const widgetIds = (l: Layout, columnId: string) =>
  l.columns.find((c) => c.id === columnId)?.widgets.map((w) => w.id);

const bookmarks: BookmarksWidget = {
  is: "bookmarks",
  id: "w1",
  subheading: "Links",
  collapsed: false,
  items: [
    { is: "folder", id: "f1", label: "F", expanded: false, children: [] },
    { is: "link", id: "l1", label: "L", url: "https://x.test" },
  ],
};

Deno.test("replace-layout swaps in the new layout", () => {
  const layout = { ...emptyLayout, columns: [] };
  assertEquals(applyAction(emptyLayout, { is: "replace-layout", layout }), layout);
});

Deno.test("set-background replaces the background", () => {
  const background = { imageUrl: null, color: "#000000", opacity: 0.5 };
  assertEquals(
    applyAction(emptyLayout, { is: "set-background", background }).background,
    background,
  );
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
    color: "#112233",
  });
  assertEquals(l.columns.map((c) => c.color), ["#ffffff", "#112233"]);
});

Deno.test("edit-column swaps in the edited column and appends sent widgets", () => {
  const snippets = newWidget("snippets", "s");
  const start = layout(
    column("a", [bookmarks, snippets]),
    column("b", [newWidget("form-grid", "g")]),
  );
  const l = applyAction(start, {
    is: "edit-column",
    column: { ...column("a", [snippets]), heading: "Edited", color: "#112233" },
    sent: [{ toColumnId: "b", widget: bookmarks }],
  });
  assertEquals(l.columns.map((c) => [c.heading, c.color]), [
    ["Edited", "#112233"],
    ["New Column", "#ffffff"],
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

Deno.test("toggle-widget flips collapsed", () => {
  const l = applyAction(layout(column("a", [bookmarks])), {
    is: "toggle-widget",
    columnId: "a",
    widgetId: "w1",
  });
  assertEquals(l.columns.at(0)?.widgets.at(0)?.collapsed, true);
});

Deno.test("toggle-folder flips only the target folder", () => {
  const l = applyAction(layout(column("a", [bookmarks])), {
    is: "toggle-folder",
    columnId: "a",
    widgetId: "w1",
    folderId: "f1",
  });
  const widget = l.columns.at(0)?.widgets.at(0);
  assertEquals(widget?.is === "bookmarks" && widget.items, [
    { is: "folder", id: "f1", label: "F", expanded: true, children: [] },
    { is: "link", id: "l1", label: "L", url: "https://x.test" },
  ]);
});

Deno.test("toggle-folder ignores non-bookmark widgets", () => {
  const l = layout(column("a", [newWidget("snippets", "s")]));
  assertEquals(
    applyAction(l, {
      is: "toggle-folder",
      columnId: "a",
      widgetId: "s",
      folderId: "f1",
    }),
    l,
  );
});

Deno.test("discard-untouched-columns removes only listed columns left as created", () => {
  const renamed = { ...column("renamed"), heading: "Work" };
  const filled = column("filled", [newWidget("bookmarks", "w")]);
  const start = layout(column("fresh"), renamed, filled, column("unlisted"));
  const result = applyAction(start, {
    is: "discard-untouched-columns",
    columnIds: ["fresh", "renamed", "filled", "missing"],
  });
  assertEquals(ids(result), ["renamed", "filled", "unlisted"]);
});
