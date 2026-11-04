/** Pure editing logic behind the widget editor dialog. */
import { moveWhere } from "../common/arrays.ts";
import { parseOutline, serializeOutline } from "../common/bookmark-outline.ts";
import type { Widget } from "../common/model.ts";
import { placeholder } from "../common/url-template.ts";

/** Bookmarks are edited as outline text; other widgets are edited directly. */
export type Draft = { readonly widget: Widget; readonly outline: string };

export const toDraft = (widget: Widget): Draft => ({
  widget,
  outline: widget.is === "bookmarks" ? serializeOutline(widget.items) : "",
});

export type Finished =
  | { ok: true; widget: Widget }
  | { ok: false; errorMessage: string };

export const finishDraft = (draft: Draft, makeId: () => string): Finished => {
  const { widget } = draft;
  switch (widget.is) {
    case "bookmarks": {
      const parsed = parseOutline(draft.outline, widget.items, makeId);
      return parsed.ok ? { ok: true, widget: { ...widget, items: parsed.items } } : parsed;
    }
    case "snippets":
    case "assistant":
    case "mfe":
      return { ok: true, widget };
    case "form-grid": {
      const bad = widget.fields.find((f) => !f.urlTemplate.includes(placeholder));
      return bad === undefined ? { ok: true, widget } : {
        ok: false,
        errorMessage: `"${bad.label || "Untitled"}": URL template must contain ${placeholder}`,
      };
    }
    default:
      return widget satisfies never;
  }
};

/** Moves the item with `id` one position up (-1) or down (+1). */
export const nudge = <T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  id: string,
  delta: -1 | 1,
): ReadonlyArray<T> => {
  const index = items.findIndex((item) => item.id === id);
  return index === -1 ? items : moveWhere(items, (item) => item.id === id, index + delta);
};
