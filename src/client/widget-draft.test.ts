import { assertEquals } from "@std/assert";
import { type FormGridWidget, newWidget } from "../common/model.ts";
import { finishDraft, nudge, toDraft } from "./widget-draft.ts";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

Deno.test("bookmark drafts round-trip through the outline", () => {
  const widget = {
    ...newWidget("bookmarks", "w"),
    items: [{ is: "link" as const, id: "id1", label: "A", url: "https://a.test" }],
  };
  const draft = toDraft(widget);
  assertEquals(draft.outline, "A | https://a.test");
  assertEquals(finishDraft(draft, ids()), { ok: true, widget });
});

Deno.test("bookmark drafts surface outline errors", () => {
  const draft = { ...toDraft(newWidget("bookmarks", "w")), outline: "A | nope" };
  assertEquals(finishDraft(draft, ids()).ok, false);
});

Deno.test("snippet drafts finish unchanged", () => {
  const widget = newWidget("snippets", "w");
  assertEquals(toDraft(widget).outline, "");
  assertEquals(finishDraft(toDraft(widget), ids()), { ok: true, widget });
});

Deno.test("form grid drafts require the placeholder in every template", () => {
  const base = newWidget("form-grid", "w") as FormGridWidget;
  const good = { ...base, fields: [{ id: "f", label: "Q", urlTemplate: "https://x/{query}" }] };
  assertEquals(finishDraft(toDraft(good), ids()), { ok: true, widget: good });
  const bad = { ...base, fields: [{ id: "f", label: "", urlTemplate: "https://x/" }] };
  assertEquals(finishDraft(toDraft(bad), ids()), {
    ok: false,
    errorMessage: `"Untitled": URL template must contain {query}`,
  });
});

Deno.test("nudge moves items up and down, ignoring unknown ids", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assertEquals(nudge(items, "b", -1).map((x) => x.id), ["b", "a", "c"]);
  assertEquals(nudge(items, "b", 1).map((x) => x.id), ["a", "c", "b"]);
  assertEquals(nudge(items, "a", -1).map((x) => x.id), ["a", "b", "c"]);
  assertEquals(nudge(items, "z", 1), items);
});
