/**
 * The persisted shape of the home page. Shared by client and server, and
 * validated at both ends of the wire via Effect Schema.
 */
import { Schema } from "effect";
import { defaultSchedule, Schedule } from "./day-cycle.ts";
import { WidgetId } from "./widgets.ts";

/**
 * A widget in a column. Its type is an MFE, built from
 * src/client/widgets/<is>/, which decodes `config` itself (see SELF_BUILDING.md).
 */
export const Widget = Schema.Struct({
  id: Schema.String,
  /** The widget type's ID. */
  is: WidgetId,
  subheading: Schema.String,
  collapsed: Schema.Boolean,
  /** The widget's settings, as JSON. Only the widget type knows its shape. */
  config: Schema.Unknown,
});
export type Widget = typeof Widget.Type;

const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

/**
 * Brings a widget saved in an older shape up to date:
 * - Before widgets were MFEs, a widget's settings sat beside its id, e.g.
 *   `{ is: "bookmarks", id, subheading, collapsed, items }`. They move into `config`.
 * - Briefly, MFE widgets were `{ is: "mfe", mfe: "<type>", config, ... }`.
 * Anything else is left for the schema to judge.
 */
export const migrateWidget = (stored: unknown): unknown => {
  if (!isRecord(stored)) {
    return stored;
  }
  if (stored.is === "mfe" && typeof stored.mfe === "string") {
    const { mfe, ...rest } = stored;
    return { ...rest, is: mfe };
  }
  if (!("config" in stored)) {
    const { id, is, subheading, collapsed, ...config } = stored;
    return { id, is, subheading, collapsed, config };
  }
  return stored;
};

/** A widget as saved, in any shape it has ever had. Always saved in the current one. */
const StoredWidget = Schema.transform(Schema.Unknown, Widget, {
  strict: true,
  decode: (stored) => migrateWidget(stored) as typeof Widget.Encoded,
  encode: (widget) => widget,
});

/** A `#rrggbb` color. */
export const HexColor = Schema.String.pipe(Schema.pattern(/^#[0-9a-fA-F]{6}$/));

export const defaultColumnColor = "#ffffff";

/**
 * Icon shown left of a column's heading, named by its react-icons export (e.g.
 * "LuStar"). Kept as a plain string so this module stays free of UI code.
 */
export const defaultColumnIcon = "LuLayoutGrid";

export const Column = Schema.Struct({
  id: Schema.String,
  heading: Schema.String,
  hidden: Schema.Boolean,
  /** Background color. Layouts saved before this field existed decode as white. */
  color: Schema.optionalWith(HexColor, { default: () => defaultColumnColor }),
  /** Layouts saved before this field existed decode with the default icon. */
  icon: Schema.optionalWith(Schema.String, { default: () => defaultColumnIcon }),
  widgets: Schema.Array(StoredWidget),
});
export type Column = typeof Column.Type;

/**
 * Layouts saved while the page was skinnable also have `background` and `skin`.
 * The page no longer has either, so they're ignored when read and dropped when
 * next saved (Effect Schema ignores fields a struct doesn't declare).
 */
export const Layout = Schema.Struct({
  version: Schema.Literal(1),
  /**
   * When the user's day starts and ends, which sets night mode and what time-aware
   * widgets show. Layouts saved before this field existed decode with 9 to 5.
   */
  schedule: Schema.optionalWith(Schedule, { default: () => defaultSchedule }),
  columns: Schema.Array(Column),
});
export type Layout = typeof Layout.Type;

export const emptyLayout: Layout = {
  version: 1,
  schedule: defaultSchedule,
  columns: [],
};

const newColumnHeading = "New Column";

export const newColumn = (id: string, icon: string): Column => ({
  id,
  heading: newColumnHeading,
  hidden: false,
  color: defaultColumnColor,
  icon,
  widgets: [],
});

/** Still has the default heading and no widgets: nothing the user would miss. */
export const isUntouchedColumn = (column: Column): boolean =>
  column.heading === newColumnHeading && column.widgets.length === 0;

/** A new widget of a type the widget build found, with its default settings. */
export const newWidget = (
  type: { readonly id: string; readonly title: string; readonly defaultConfig: unknown },
  id: string,
): Widget => ({
  id,
  is: type.id,
  subheading: type.title,
  collapsed: false,
  config: type.defaultConfig,
});
