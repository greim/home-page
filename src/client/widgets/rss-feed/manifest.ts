import { defineManifest } from "../../../common/widgets.ts";
import { maxCount, RssFeedConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "RSS Feed",
  description: "Shows a news feed (RSS, Atom or JSON Feed): its icon and title, and its latest " +
    "headlines, each a link to the story. Clicking a headline whose story the feed includes " +
    "opens it to read full screen. Settings: feedUrl, the feed's own URL, not its site's home " +
    'page (a site\'s page names its feed in a <link rel="alternate" ' +
    'type="application/rss+xml"> or "application/atom+xml" tag; /feed, /rss and /feed.xml are ' +
    `common); and count, how many headlines to show (1 to ${maxCount}).`,
  config: RssFeedConfig,
  defaultConfig: { feedUrl: "", count: 10 },
  apis: ["feeds"],
  fullScreen: { width: 52, height: "full" },
});
