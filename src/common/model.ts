/**
 * The persisted shape of the home page. Shared by client and server, and
 * validated at both ends of the wire via Effect Schema.
 */
import { Schema } from "effect";
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
 * Same-origin URL of a background image: a built-in texture (src/client/static/,
 * served under /web/assets/) or one saved by the user (under /api/backgrounds/).
 * External URLs are never stored; the server fetches and saves those locally.
 */
export const BackgroundImageUrl = Schema.String.pipe(
  Schema.pattern(/^\/(web\/assets|api\/backgrounds)\/[\w-]+\.[a-z0-9]+$/),
);

/** The surface behind the columns: a color with an optional tiled image over it. */
export const Background = Schema.Struct({
  /** Tiled over `color`; null for a plain color. */
  imageUrl: Schema.NullOr(BackgroundImageUrl),
  color: HexColor,
  /** Opacity of the tiled image, from 0 to 1. Lower values let `color` show through. */
  opacity: Schema.Number.pipe(Schema.between(0, 1)),
});
export type Background = typeof Background.Type;

export const defaultBackground: Background = {
  imageUrl: "/web/assets/trees.jpg",
  color: "#666666",
  opacity: 1,
};

/** The generic CSS font families, one of which every font falls back to. */
export const GenericFamily = Schema.Literal(
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
);
export type GenericFamily = typeof GenericFamily.Type;

/**
 * A font's family name, e.g. "Open Sans". Limited to letters, digits, spaces and
 * hyphens, so it can be quoted into CSS and a Google Fonts URL as is.
 */
export const FontName = Schema.String.pipe(
  Schema.pattern(/^[A-Za-z0-9][A-Za-z0-9 -]*$/),
  Schema.maxLength(100),
);

/** A font installed on the user's computer. A null name uses the fallback alone. */
export const SystemFont = Schema.Struct({
  is: Schema.Literal("system"),
  name: Schema.NullOr(FontName),
  fallback: GenericFamily,
});
export type SystemFont = typeof SystemFont.Type;

/**
 * A font from fonts.google.com, by its name there (e.g. "Open Sans"). The page
 * loads it from Google, in every weight it has; the fallback shows until it
 * loads, or if no Google font has that name.
 */
export const GoogleFont = Schema.Struct({
  is: Schema.Literal("google"),
  name: FontName,
  fallback: GenericFamily,
});
export type GoogleFont = typeof GoogleFont.Type;

const isGenericFamily = Schema.is(GenericFamily);

/**
 * Reads a font saved as a CSS font-family list (as skins briefly were), e.g.
 * `Georgia, "Times New Roman", serif`: its first font, and its last if that's a
 * generic family (otherwise sans-serif).
 */
export const legacyFont = (list: string): SystemFont => {
  const names = list.split(",").map((n) => n.trim().replace(/^["']|["']$/g, ""));
  const first = names.at(0) ?? "";
  const last = names.at(-1) ?? "";
  return isGenericFamily(first)
    ? { is: "system", name: null, fallback: first }
    : { is: "system", name: first, fallback: isGenericFamily(last) ? last : "sans-serif" };
};

/** A font saved as a CSS font-family list string decodes as a system font. */
const LegacyFont = Schema.transform(Schema.String, SystemFont, {
  strict: true,
  decode: legacyFont,
  encode: (font) => font.name === null ? font.fallback : `${font.name}, ${font.fallback}`,
});

export const Font = Schema.Union(SystemFont, GoogleFont, LegacyFont);
export type Font = typeof Font.Type;

const between = (min: number, max: number) => Schema.Number.pipe(Schema.between(min, max));

/** A font weight from 100 (thin) to 900 (black); 400 is regular, 700 bold. */
const FontWeight = Schema.Int.pipe(Schema.between(100, 900));

/** Drop shadow cast by columns (and, scaled down, their navigator thumbnails). */
export const Shadow = Schema.Struct({
  /** Blur radius, in rem. */
  blur: between(0, 10),
  /** How far the shadow falls from the column, in rem. */
  distance: between(0, 10),
  /** Darkness, from 0 (none) to 1 (solid black). */
  opacity: between(0, 1),
  /**
   * Where the light comes from, in degrees: 0 is straight above, so the shadow
   * falls straight down; positive angles move the light west (left), so the
   * shadow falls down and to the right. Shadows saved before this existed get 35.
   */
  angle: Schema.optionalWith(between(-180, 180), { default: () => 35 }),
});
export type Shadow = typeof Shadow.Type;

export const defaultSkin = {
  textSpacing: 1.7,
  layoutSpacing: 1.6,
  cornerRounding: 1.6,
  columnShadow: { blur: 1.92, distance: 1, opacity: 0.5, angle: 35 },
  headingFont: { is: "google", name: "Open Sans", fallback: "sans-serif" },
  bodyFont: { is: "google", name: "Open Sans", fallback: "sans-serif" },
  codeFont: { is: "google", name: "Source Code Pro", fallback: "monospace" },
  columnPadding: 1.2,
  columnHeadingWeight: 500,
  columnHeadingOpacity: 0.5,
  widgetHeadingWeight: 500,
  widgetHeadingOpacity: 0.5,
} as const;

/** Keeps a field required once decoded, defaulting it when saved data lacks it. */
const withDefault = <S extends Schema.Schema.Any>(schema: S, value: Schema.Schema.Type<S>) =>
  Schema.optionalWith(schema, { default: () => value });

/**
 * How the page looks, apart from the background and column colors. Lengths are
 * unitless numbers of rem, and the root font size scales with the viewport's
 * width, so the whole page scales with it. Each field defaults on its own, so a
 * skin can list just the fields that differ from the defaults.
 */
export const Skin = Schema.Struct({
  /** Line height of all text, as a multiple of the font size. */
  textSpacing: withDefault(between(1, 3), defaultSkin.textSpacing),
  /** Space between columns, and around them; other spacing is derived from it. */
  layoutSpacing: withDefault(between(0.25, 6), defaultSkin.layoutSpacing),
  /** Corner radius of columns; other corner radii are derived from it. */
  cornerRounding: withDefault(between(0, 6), defaultSkin.cornerRounding),
  columnShadow: withDefault(Shadow, defaultSkin.columnShadow),
  headingFont: withDefault(Font, defaultSkin.headingFont),
  bodyFont: withDefault(Font, defaultSkin.bodyFont),
  /** Font of code and copyable snippets. */
  codeFont: withDefault(Font, defaultSkin.codeFont),
  /** Padding inside columns. The top is a little less and the bottom a little more. */
  columnPadding: withDefault(between(0.25, 6), defaultSkin.columnPadding),
  columnHeadingWeight: withDefault(FontWeight, defaultSkin.columnHeadingWeight),
  /** Opacity of column headings (and their icons), from 0 to 1. */
  columnHeadingOpacity: withDefault(between(0, 1), defaultSkin.columnHeadingOpacity),
  widgetHeadingWeight: withDefault(FontWeight, defaultSkin.widgetHeadingWeight),
  /** Opacity of widget headings, from 0 to 1. */
  widgetHeadingOpacity: withDefault(between(0, 1), defaultSkin.widgetHeadingOpacity),
});
export type Skin = typeof Skin.Type;

export const Layout = Schema.Struct({
  version: Schema.Literal(1),
  /** Layouts saved before this field existed decode with the default background. */
  background: Schema.optionalWith(Background, { default: () => defaultBackground }),
  /** Layouts saved before this field existed decode with the default skin. */
  skin: Schema.optionalWith(Skin, { default: () => defaultSkin }),
  columns: Schema.Array(Column),
});
export type Layout = typeof Layout.Type;

export const emptyLayout: Layout = {
  version: 1,
  background: defaultBackground,
  skin: defaultSkin,
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
