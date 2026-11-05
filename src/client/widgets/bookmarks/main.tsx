/** The bookmarks widget: links, and folders of links that open and close. */
import { registerMfe } from "../../mfe/register-live.tsx";
import { editorView, widgetView } from "../../widget-kit/views.tsx";
import { Bookmarks } from "./bookmarks.tsx";
import { BookmarksConfig } from "./config.ts";
import { BookmarksEditor } from "./editor.tsx";

registerMfe("bookmarks", () => ({
  widget: widgetView(BookmarksConfig, Bookmarks),
  editor: editorView(BookmarksConfig, BookmarksEditor),
}));
