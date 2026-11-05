import { defineManifest } from "../../../common/widgets.ts";
import { BookmarksConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Bookmarks",
  description:
    "A list of links, which may be grouped into folders that open and close. Folders hold links only; they don't nest.",
  config: BookmarksConfig,
  defaultConfig: { items: [] },
});
