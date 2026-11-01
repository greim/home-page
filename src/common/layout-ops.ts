/**
 * Every change a user can make to the layout, expressed as data, plus a pure
 * reducer that applies one. Actions referencing unknown ids are no-ops.
 */
import { insertAt, mapWhere, moveWhere, removeWhere } from "./arrays.ts";
import {
  type Background,
  type Column,
  isUntouchedColumn,
  type Layout,
  type Widget,
} from "./model.ts";

export type LayoutAction =
  /** Swaps in a whole new layout, e.g. one the admin assistant applied. */
  | { is: "replace-layout"; layout: Layout }
  | { is: "set-background"; background: Background }
  | { is: "add-column"; index: number; column: Column }
  | { is: "rename-column"; columnId: string; heading: string }
  | { is: "remove-column"; columnId: string }
  /** Removes those of the given columns that are still untouched (see isUntouchedColumn). */
  | { is: "discard-untouched-columns"; columnIds: ReadonlyArray<string> }
  | { is: "move-column"; columnId: string; toIndex: number }
  | { is: "set-column-hidden"; columnId: string; hidden: boolean }
  | { is: "set-column-icon"; columnId: string; icon: string }
  /**
   * Saves the column content editor: swaps in the edited column (matched by id)
   * and appends each sent widget to its target column. A widget sent to a column
   * that no longer exists stays in the edited column rather than being lost.
   */
  | { is: "edit-column"; column: Column; sent: ReadonlyArray<SentWidget> }
  | { is: "toggle-widget"; columnId: string; widgetId: string }
  | {
    is: "toggle-folder";
    columnId: string;
    widgetId: string;
    folderId: string;
  };

export type SentWidget = { readonly toColumnId: string; readonly widget: Widget };

const byId = (id: string) => (item: { readonly id: string }): boolean => item.id === id;

const updateColumn = (
  layout: Layout,
  columnId: string,
  fn: (column: Column) => Column,
): Layout => ({
  ...layout,
  columns: mapWhere(layout.columns, byId(columnId), fn),
});

const updateWidget = (
  layout: Layout,
  columnId: string,
  widgetId: string,
  fn: (widget: Widget) => Widget,
): Layout =>
  updateColumn(layout, columnId, (column) => ({
    ...column,
    widgets: mapWhere(column.widgets, byId(widgetId), fn),
  }));

const editColumn = (
  layout: Layout,
  action: Extract<LayoutAction, { is: "edit-column" }>,
): Layout => {
  const exists = (id: string) => layout.columns.some(byId(id));
  if (!exists(action.column.id)) {
    return layout;
  }
  const replaced = updateColumn(layout, action.column.id, () => action.column);
  return action.sent.reduce(
    (l, { toColumnId, widget }) =>
      updateColumn(l, exists(toColumnId) ? toColumnId : action.column.id, (column) => ({
        ...column,
        widgets: [...column.widgets, widget],
      })),
    replaced,
  );
};

const toggleFolder = (widget: Widget, folderId: string): Widget => {
  if (widget.is !== "bookmarks") {
    return widget;
  }
  return {
    ...widget,
    items: widget.items.map((node) =>
      node.is === "folder" && node.id === folderId ? { ...node, expanded: !node.expanded } : node
    ),
  };
};

export const applyAction = (layout: Layout, action: LayoutAction): Layout => {
  switch (action.is) {
    case "replace-layout":
      return action.layout;
    case "set-background":
      return { ...layout, background: action.background };
    case "add-column":
      return {
        ...layout,
        columns: insertAt(layout.columns, action.index, action.column),
      };
    case "rename-column":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        heading: action.heading,
      }));
    case "discard-untouched-columns":
      return {
        ...layout,
        columns: layout.columns.filter((column) =>
          !(action.columnIds.includes(column.id) && isUntouchedColumn(column))
        ),
      };
    case "remove-column":
      return {
        ...layout,
        columns: removeWhere(layout.columns, byId(action.columnId)),
      };
    case "move-column":
      return {
        ...layout,
        columns: moveWhere(
          layout.columns,
          byId(action.columnId),
          action.toIndex,
        ),
      };
    case "set-column-hidden":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        hidden: action.hidden,
      }));
    case "set-column-icon":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        icon: action.icon,
      }));
    case "edit-column":
      return editColumn(layout, action);
    case "toggle-widget":
      return updateWidget(
        layout,
        action.columnId,
        action.widgetId,
        (widget) => ({ ...widget, collapsed: !widget.collapsed }),
      );
    case "toggle-folder":
      return updateWidget(
        layout,
        action.columnId,
        action.widgetId,
        (widget) => toggleFolder(widget, action.folderId),
      );
    default:
      return action satisfies never;
  }
};
