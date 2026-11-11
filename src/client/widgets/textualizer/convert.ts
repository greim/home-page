/**
 * Turns the textualizer's source into what it shows and copies: HTML for the
 * preview and "Formatted", Markdown for "Markdown". HTML only ever comes out of
 * here by way of Markdown (or as code in a <pre>), so it holds only text and its
 * formatting: no scripts, styles, frames or event handlers.
 *
 * HTML goes in as a plain tree (HtmlNode), parsed by the caller, so this runs
 * anywhere; the widget parses with the browser's DOMParser.
 */
import type { Nodes, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type HtmlNode, htmlToMarkdown } from "./html-to-markdown.ts";
import type { Source } from "./source.ts";

/** Parses HTML into the tree `htmlToMarkdown` takes. */
export type HtmlParser = (html: string) => ReadonlyArray<HtmlNode>;

const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

/** Links and images to the web, mail, or the same page; never `javascript:` or `data:`. */
const safeUrl = (url: string): boolean =>
  /^(?:https?:|mailto:|#|\/|\.)/i.test(url.trim()) || !/^[^/?#]*:/.test(url.trim());

/** Takes unsafe links and image sources out of a tree, in place. */
const dropUnsafeUrls = (node: Nodes): void => {
  if (node.type === "element") {
    for (const name of ["href", "src"]) {
      const url = node.properties[name];
      if (typeof url === "string" && !safeUrl(url)) delete node.properties[name];
    }
  }
  if ("children" in node) { for (const child of node.children) dropUnsafeUrls(child); }
};

/** GitHub-flavored Markdown as an HTML tree. HTML written in the Markdown is left out. */
export const markdownTree = (markdown: string): Root => {
  const tree = markdownProcessor.runSync(markdownProcessor.parse(markdown));
  dropUnsafeUrls(tree);
  return tree;
};

/** GitHub-flavored Markdown as HTML. HTML written in the Markdown is left out. */
export const markdownToHtml = (markdown: string): string => toHtml(markdownTree(markdown));

/** HTML reduced to its text and formatting, by way of Markdown. */
export const sanitizeHtml = (nodes: ReadonlyArray<HtmlNode>): string =>
  markdownToHtml(htmlToMarkdown(nodes));

/** Code as a monospace block, styled inline so the style survives a copy. */
export const codeTree = (code: string): Root => ({
  type: "root",
  children: [{
    type: "element",
    tagName: "pre",
    properties: {
      style: "font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre",
    },
    children: [{ type: "text", value: code }],
  }],
});

/** Code in a Markdown code fence, longer than any run of backticks in it. */
export const fenced = (code: string, language: string): string => {
  const longest = Math.max(0, ...Array.from(code.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${code.replace(/\n$/, "")}\n${fence}`;
};

/** The source as an HTML tree: what the preview shows. */
export const formattedTree = (source: Source, parse: HtmlParser): Root => {
  switch (source.kind) {
    case "script":
    case "json":
      return codeTree(source.data);
    case "html":
      return markdownTree(htmlToMarkdown(parse(source.data)));
    case "markdown":
      return markdownTree(source.data);
    default:
      return source.kind satisfies never;
  }
};

/** The source as HTML: what "Formatted" and "HTML" copy. */
export const formattedHtml = (source: Source, parse: HtmlParser): string =>
  toHtml(formattedTree(source, parse));

/** The source as Markdown: what "Markdown" copies, and what the grammar checker reads. */
export const markdownOf = (source: Source, parse: HtmlParser): string => {
  switch (source.kind) {
    case "script":
      return fenced(source.data, "typescript");
    case "json":
      return fenced(source.data, "json");
    case "html":
      return htmlToMarkdown(parse(source.data));
    case "markdown":
      return source.data;
    default:
      return source.kind satisfies never;
  }
};

/** The ways to copy the source, in the order the menu lists them. */
export const copyFormats = ["source", "formatted", "markdown", "html"] as const;
export type CopyFormat = typeof copyFormats[number];

export const copyFormatLabels: Readonly<Record<CopyFormat, string>> = {
  source: "Source",
  formatted: "Formatted",
  markdown: "Markdown",
  html: "HTML",
};

/** What goes on the clipboard: always plain text, and HTML too when it's formatted. */
export type ClipboardData =
  | { readonly is: "text"; readonly text: string }
  | { readonly is: "rich"; readonly html: string; readonly text: string };

export const clipboardData = (
  format: CopyFormat,
  source: Source,
  parse: HtmlParser,
): ClipboardData => {
  switch (format) {
    case "source":
      return { is: "text", text: source.data };
    case "formatted":
      return {
        is: "rich",
        html: formattedHtml(source, parse),
        // For somewhere that only takes plain text: the code itself, or the Markdown.
        text: source.kind === "script" || source.kind === "json"
          ? source.data
          : markdownOf(source, parse),
      };
    case "markdown":
      return { is: "text", text: markdownOf(source, parse) };
    case "html":
      return { is: "text", text: formattedHtml(source, parse) };
    default:
      return format satisfies never;
  }
};
