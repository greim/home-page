import { defineManifest } from "../../../common/widgets.ts";
import { BookmarksConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Bookmarks",
  description:
    "A list of links under a heading that opens and closes the list. Links may be grouped into folders that open and close too. Folders hold links only; they don't nest.",
  config: BookmarksConfig,
  defaultConfig: { heading: "Bookmarks", collapsed: false, items: [] },
});
