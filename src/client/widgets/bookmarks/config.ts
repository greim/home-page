/** The bookmarks widget's config: links, and folders of links. */
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

export const BookmarksConfig = Schema.Struct({ items: Schema.Array(BookmarkNode) });
export type BookmarksConfig = typeof BookmarksConfig.Type;

/** Opens or closes one folder. */
export const toggleFolder = (config: BookmarksConfig, folderId: string): BookmarksConfig => ({
  items: config.items.map((node) =>
    node.is === "folder" && node.id === folderId ? { ...node, expanded: !node.expanded } : node
  ),
});
