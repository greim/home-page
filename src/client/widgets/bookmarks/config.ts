/**
 * The bookmarks widget's config: links, and folders of links. What's open or closed isn't
 * config: see open-state.ts.
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
  children: Schema.Array(Link),
});
export type Folder = typeof Folder.Type;

export const BookmarkNode = Schema.Union(Link, Folder);
export type BookmarkNode = typeof BookmarkNode.Type;

export const BookmarksConfig = Schema.Struct({
  /** Shown above the links; clicking it opens or closes the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
  items: Schema.Array(BookmarkNode),
});
export type BookmarksConfig = typeof BookmarksConfig.Type;
