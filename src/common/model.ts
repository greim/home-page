/**
 * The persisted shape of the home page. Shared by client and server, and
 * validated at both ends of the wire via Effect Schema.
 */
import { Schema } from "effect";

export const Link = Schema.Struct({
  is: Schema.Literal("link"),
  id: Schema.String,
  label: Schema.String,
  url: Schema.String,
});
export type Link = typeof Link.Type;

/** A branch node. Only one level of nesting: folders contain links only. */
export const Folder = Schema.Struct({
  is: Schema.Literal("folder"),
  id: Schema.String,
  label: Schema.String,
  expanded: Schema.Boolean,
  children: Schema.Array(Link),
});
export type Folder = typeof Folder.Type;

export const BookmarkNode = Schema.Union(Link, Folder);
export type BookmarkNode = typeof BookmarkNode.Type;

export const SnippetCopy = Schema.Literal("whole", "char");
export type SnippetCopy = typeof SnippetCopy.Type;

export const Snippet = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  text: Schema.String,
  copy: SnippetCopy,
});
export type Snippet = typeof Snippet.Type;

export const FormField = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** A URL containing `{query}`, which is replaced by the field's value. */
  urlTemplate: Schema.String,
});
export type FormField = typeof FormField.Type;

const widgetBase = {
  id: Schema.String,
  subheading: Schema.String,
  collapsed: Schema.Boolean,
};

export const BookmarksWidget = Schema.Struct({
  is: Schema.Literal("bookmarks"),
  ...widgetBase,
  items: Schema.Array(BookmarkNode),
});
export type BookmarksWidget = typeof BookmarksWidget.Type;

export const SnippetsWidget = Schema.Struct({
  is: Schema.Literal("snippets"),
  ...widgetBase,
  snippets: Schema.Array(Snippet),
});
export type SnippetsWidget = typeof SnippetsWidget.Type;

export const GridColumns = Schema.Literal(1, 2, 3, 4);
export type GridColumns = typeof GridColumns.Type;

export const FormGridWidget = Schema.Struct({
  is: Schema.Literal("form-grid"),
  ...widgetBase,
  gridColumns: GridColumns,
  fields: Schema.Array(FormField),
});
export type FormGridWidget = typeof FormGridWidget.Type;

/** A chat with the admin assistant, pinned into a column. It has nothing to configure. */
export const AssistantWidget = Schema.Struct({
  is: Schema.Literal("assistant"),
  ...widgetBase,
});
export type AssistantWidget = typeof AssistantWidget.Type;

export const Widget = Schema.Union(
  BookmarksWidget,
  SnippetsWidget,
  FormGridWidget,
  AssistantWidget,
);
export type Widget = typeof Widget.Type;
export type WidgetKind = Widget["is"];

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
  widgets: Schema.Array(Widget),
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
  color: "#141416",
  opacity: 1,
};

export const Layout = Schema.Struct({
  version: Schema.Literal(1),
  /** Layouts saved before this field existed decode with the default background. */
  background: Schema.optionalWith(Background, { default: () => defaultBackground }),
  columns: Schema.Array(Column),
});
export type Layout = typeof Layout.Type;

export const emptyLayout: Layout = { version: 1, background: defaultBackground, columns: [] };

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

export const widgetKinds: ReadonlyArray<
  { readonly is: WidgetKind; readonly name: string }
> = [
  { is: "bookmarks", name: "Bookmarks" },
  { is: "snippets", name: "Copyable Snippets" },
  { is: "form-grid", name: "Form Grid" },
  { is: "assistant", name: "Assistant" },
];

export const newWidget = (is: WidgetKind, id: string): Widget => {
  switch (is) {
    case "bookmarks":
      return { is, id, subheading: "Bookmarks", collapsed: false, items: [] };
    case "snippets":
      return { is, id, subheading: "Snippets", collapsed: false, snippets: [] };
    case "form-grid":
      return {
        is,
        id,
        subheading: "Search",
        collapsed: false,
        gridColumns: 1,
        fields: [],
      };
    case "assistant":
      return { is, id, subheading: "Assistant", collapsed: false };
    default:
      return is satisfies never;
  }
};
