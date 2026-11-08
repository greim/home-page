/**
 * Pure editing logic behind the column content editor: a draft of one column's
 * attributes and widgets, edited freely and committed (or discarded) as a whole.
 * Its color isn't in the draft: that's changed live from its thumbnail, so
 * saving keeps whatever the column has by then.
 */
import { moveWhere, removeWhere } from "../common/arrays.ts";
import type { LayoutAction, SentWidget } from "../common/layout-ops.ts";
import type { Column, Widget } from "../common/model.ts";
import { type Draft, finishDraft, toDraft } from "./widget-draft.ts";

export type ColumnDraft = {
  readonly heading: string;
  readonly icon: string;
  /** The column's widgets, in order. */
  readonly widgets: ReadonlyArray<Draft>;
  /** Widgets sent to other columns, removed from this one. */
  readonly sent: ReadonlyArray<{ readonly toColumnId: string; readonly draft: Draft }>;
  /** The widget shown in the editor pane, if any. */
  readonly selectedId: string | null;
};

const idOf = (draft: Draft): string => draft.widget.id;
const hasId = (id: string) => (draft: Draft): boolean => idOf(draft) === id;

/** A draft of `column`, with `selectedId` selected if it's one of its widgets. */
export const toColumnDraft = (column: Column, selectedId: string | null): ColumnDraft => ({
  heading: column.heading,
  icon: column.icon,
  widgets: column.widgets.map(toDraft),
  sent: [],
  selectedId: column.widgets.some((w) => w.id === selectedId) ? selectedId : null,
});

export const selectedDraft = (draft: ColumnDraft): Draft | undefined =>
  draft.widgets.find(hasId(draft.selectedId ?? ""));

export const selectWidget = (draft: ColumnDraft, id: string | null): ColumnDraft => ({
  ...draft,
  selectedId: id !== null && draft.widgets.some(hasId(id)) ? id : null,
});

/** Swaps in a widget's edited draft, matched by widget id. */
export const updateWidget = (draft: ColumnDraft, widget: Draft): ColumnDraft => ({
  ...draft,
  widgets: draft.widgets.map((w) => (idOf(w) === idOf(widget) ? widget : w)),
});

/** Appends a new widget and selects it. */
export const addWidget = (draft: ColumnDraft, widget: Widget): ColumnDraft => ({
  ...draft,
  widgets: [...draft.widgets, toDraft(widget)],
  selectedId: widget.id,
});

export const moveWidget = (draft: ColumnDraft, id: string, toIndex: number): ColumnDraft => ({
  ...draft,
  widgets: moveWhere(draft.widgets, hasId(id), toIndex),
});

const deselect = (draft: ColumnDraft, id: string): string | null =>
  draft.selectedId === id ? null : draft.selectedId;

export const removeWidget = (draft: ColumnDraft, id: string): ColumnDraft => ({
  ...draft,
  widgets: removeWhere(draft.widgets, hasId(id)),
  selectedId: deselect(draft, id),
});

/** Takes a widget out of this column, to be appended to another one on save. */
export const sendWidget = (draft: ColumnDraft, id: string, toColumnId: string): ColumnDraft => {
  const widget = draft.widgets.find(hasId(id));
  return widget === undefined ? draft : {
    ...removeWidget(draft, id),
    sent: [...draft.sent, { toColumnId, draft: widget }],
  };
};

export type FinishedColumn =
  | { ok: true; action: LayoutAction }
  | { ok: false; widgetId: string; errorMessage: string };

type Finished = { ok: true; widgets: ReadonlyArray<Widget> } | {
  ok: false;
  widgetId: string;
  errorMessage: string;
};

/** Finishes every draft, stopping at the first that fails. */
const finishAll = (drafts: ReadonlyArray<Draft>): Finished =>
  drafts.reduce<Finished>((acc, draft) => {
    if (!acc.ok) return acc;
    const finished = finishDraft(draft);
    return finished.ok
      ? { ok: true, widgets: [...acc.widgets, finished.widget] }
      : { ok: false, widgetId: idOf(draft), errorMessage: finished.errorMessage };
  }, { ok: true, widgets: [] });

/**
 * The action that saves the draft over `column`, or the first widget whose draft
 * is invalid (e.g. a bookmark outline that doesn't parse).
 */
export const finishColumnDraft = (column: Column, draft: ColumnDraft): FinishedColumn => {
  const widgets = finishAll(draft.widgets);
  if (!widgets.ok) return widgets;
  const sent = finishAll(draft.sent.map((s) => s.draft));
  if (!sent.ok) return sent;
  return {
    ok: true,
    action: {
      is: "edit-column",
      column: {
        ...column,
        heading: draft.heading,
        icon: draft.icon,
        widgets: widgets.widgets,
      },
      sent: sent.widgets.map((widget, i): SentWidget => ({
        toColumnId: draft.sent.at(i)?.toColumnId ?? column.id,
        widget,
      })),
    },
  };
};
