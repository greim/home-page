import { defineManifest } from "../../../common/widgets.ts";
import { PasteMarkdownConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Paste as Markdown",
  description:
    "A box that turns formatted text pasted into it, such as a copy from a web page or Google Docs, into Markdown: headings, lists, tables, bold, italics, links, code and quotes. The Markdown can be edited, previewed rendered, and copied or cut with a button: as plain Markdown, or from the preview as formatted HTML.",
  config: PasteMarkdownConfig,
  defaultConfig: { heading: "Paste as Markdown" },
});
