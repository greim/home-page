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
  | { is: "set-background"; background: Background }
  | { is: "add-column"; index: number; column: Column }
  | { is: "rename-column"; columnId: string; heading: string }
  | { is: "remove-column"; columnId: string }
  /** Removes those of the given columns that are still untouched (see isUntouchedColumn). */
  | { is: "discard-untouched-columns"; columnIds: ReadonlyArray<string> }
  | { is: "move-column"; columnId: string; toIndex: number }
  | { is: "set-column-hidden"; columnId: string; hidden: boolean }
  | { is: "set-column-color"; columnId: string; color: string }
  | { is: "add-widget"; columnId: string; index: number; widget: Widget }
  | { is: "replace-widget"; columnId: string; widget: Widget }
  | { is: "remove-widget"; columnId: string; widgetId: string }
  | {
    is: "move-widget";
    columnId: string;
    widgetId: string;
    toColumnId: string;
    toIndex: number;
  }
  | { is: "toggle-widget"; columnId: string; widgetId: string }
  | {
    is: "toggle-folder";
    columnId: string;
    widgetId: string;
    folderId: string;
  };

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

const moveWidget = (
  layout: Layout,
  action: Extract<LayoutAction, { is: "move-widget" }>,
): Layout => {
  const source = layout.columns.find(byId(action.columnId));
  const widget = source?.widgets.find(byId(action.widgetId));
  const targetExists = layout.columns.some(byId(action.toColumnId));
  if (widget === undefined || !targetExists) {
    return layout;
  }
  if (action.columnId === action.toColumnId) {
    return updateColumn(layout, action.columnId, (column) => ({
      ...column,
      widgets: moveWhere(column.widgets, byId(widget.id), action.toIndex),
    }));
  }
  const removed = updateColumn(layout, action.columnId, (column) => ({
    ...column,
    widgets: removeWhere(column.widgets, byId(widget.id)),
  }));
  return updateColumn(removed, action.toColumnId, (column) => ({
    ...column,
    widgets: insertAt(column.widgets, action.toIndex, widget),
  }));
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
    case "set-column-color":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        color: action.color,
      }));
    case "add-widget":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        widgets: insertAt(column.widgets, action.index, action.widget),
      }));
    case "replace-widget":
      return updateWidget(
        layout,
        action.columnId,
        action.widget.id,
        () => action.widget,
      );
    case "remove-widget":
      return updateColumn(layout, action.columnId, (column) => ({
        ...column,
        widgets: removeWhere(column.widgets, byId(action.widgetId)),
      }));
    case "move-widget":
      return moveWidget(layout, action);
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
