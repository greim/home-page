import { defineManifest } from "../../../common/widgets.ts";
import { PasteMarkdownConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Paste as Markdown",
  description:
    "A box that turns formatted text pasted into it, such as a copy from a web page or Google Docs, into Markdown: headings, lists, tables, bold, italics, links, code and quotes. The Markdown can be edited, then copied with a button.",
  config: PasteMarkdownConfig,
  defaultConfig: { heading: "Paste as Markdown" },
});
