import { assertEquals } from "@std/assert";
import { type Column, newColumn, newWidget } from "../common/model.ts";
import {
  addWidget,
  finishColumnDraft,
  moveWidget,
  removeWidget,
  selectedDraft,
  selectWidget,
  sendWidget,
  toColumnDraft,
  updateWidget,
} from "./column-draft.ts";
import { toDraft, withReport } from "./widget-draft.ts";

const type = (id: string) => ({ id, title: id, defaultConfig: {} });

const column: Column = {
  ...newColumn("c", "LuStar"),
  widgets: [
    newWidget(type("snippets"), "a"),
    newWidget(type("form-grid"), "b"),
    newWidget(type("bookmarks"), "x"),
  ],
};

const order = (draft: ReturnType<typeof toColumnDraft>) => draft.widgets.map((w) => w.widget.id);

Deno.test("toColumnDraft selects only widgets the column has", () => {
  assertEquals(toColumnDraft(column, "b").selectedId, "b");
  assertEquals(toColumnDraft(column, "nope").selectedId, null);
  assertEquals(toColumnDraft(column, null).selectedId, null);
});

Deno.test("selectWidget and selectedDraft track the selection", () => {
  const draft = selectWidget(toColumnDraft(column, null), "a");
  assertEquals(selectedDraft(draft)?.widget.id, "a");
  assertEquals(selectWidget(draft, "nope").selectedId, null);
  assertEquals(selectedDraft(selectWidget(draft, null)), undefined);
});

Deno.test("updateWidget swaps in the edited draft by id", () => {
  const draft = toColumnDraft(column, null);
  const edited = toDraft({ ...newWidget(type("form-grid"), "b"), subheading: "Edited" });
  assertEquals(
    updateWidget(draft, edited).widgets.map((w) => w.widget.subheading),
    ["snippets", "Edited", "bookmarks"],
  );
});

Deno.test("addWidget appends and selects", () => {
  const draft = addWidget(toColumnDraft(column, "a"), newWidget(type("bookmarks"), "n"));
  assertEquals(order(draft), ["a", "b", "x", "n"]);
  assertEquals(draft.selectedId, "n");
});

Deno.test("moveWidget reorders", () => {
  assertEquals(order(moveWidget(toColumnDraft(column, null), "a", 2)), ["b", "x", "a"]);
});

Deno.test("removeWidget drops the widget and clears its selection", () => {
  const draft = toColumnDraft(column, "a");
  assertEquals(order(removeWidget(draft, "a")), ["b", "x"]);
  assertEquals(removeWidget(draft, "a").selectedId, null);
  assertEquals(removeWidget(draft, "b").selectedId, "a");
});

Deno.test("sendWidget moves the widget out to the sent list", () => {
  const draft = sendWidget(toColumnDraft(column, "a"), "a", "other");
  assertEquals(order(draft), ["b", "x"]);
  assertEquals(draft.selectedId, null);
  assertEquals(draft.sent.map((s) => [s.toColumnId, s.draft.widget.id]), [["other", "a"]]);
  assertEquals(sendWidget(draft, "nope", "other"), draft);
});

Deno.test("finishColumnDraft builds an edit-column action", () => {
  const draft = sendWidget(
    { ...toColumnDraft(column, null), heading: "H", icon: "LuHouse", color: { c: 0.1, h: 25 } },
    "x",
    "other",
  );
  const [a, b, x] = column.widgets;
  assertEquals(finishColumnDraft(column, draft), {
    ok: true,
    action: {
      is: "edit-column",
      column: {
        ...column,
        heading: "H",
        icon: "LuHouse",
        color: { c: 0.1, h: 25 },
        widgets: [a!, b!],
      },
      sent: [{ toColumnId: "other", widget: x! }],
    },
  });
});

Deno.test("finishColumnDraft reports the first invalid widget", () => {
  const draft = toColumnDraft(column, null);
  const bad = (id: string) =>
    withReport(toDraft(newWidget(type("bookmarks"), id)), { ok: false, errorMessage: "Nope" });
  const inList = updateWidget(draft, bad("x"));
  assertEquals(finishColumnDraft(column, inList).ok, false);
  assertEquals((finishColumnDraft(column, inList) as { widgetId: string }).widgetId, "x");
  const inSent = sendWidget(inList, "x", "other");
  assertEquals((finishColumnDraft(column, inSent) as { widgetId: string }).widgetId, "x");
});
