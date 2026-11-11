/**
 * The textualizer's dealings with the browser: parsing HTML, and writing to the
 * clipboard.
 */
import type { ClipboardData, HtmlParser } from "./convert.ts";
import type { HtmlNode } from "./html-to-markdown.ts";

/** The browser's parse of some HTML, as the converter's tree. */
const fromDom = (node: Node): ReadonlyArray<HtmlNode> => {
  if (node.nodeType === Node.TEXT_NODE) return [{ is: "text", text: node.textContent ?? "" }];
  if (!(node instanceof Element)) return [];
  return [{
    is: "element",
    tag: node.localName,
    attrs: Object.fromEntries(Array.from(node.attributes, (a) => [a.name, a.value])),
    children: Array.from(node.childNodes).flatMap(fromDom),
  }];
};

/** Parses HTML (its body) with the browser's parser, which runs nothing in it. */
export const parseHtml: HtmlParser = (html) =>
  Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes).flatMap(fromDom);

/**
 * Puts data on the clipboard of the window `from` is in: the page's, or a torn-off
 * view's, which must be the focused one to write to it.
 */
export const writeClipboard = (from: Element, data: ClipboardData): Promise<void> => {
  const clipboard = (from.ownerDocument.defaultView ?? window).navigator.clipboard;
  return data.is === "text" ? clipboard.writeText(data.text) : clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([data.html], { type: "text/html" }),
      "text/plain": new Blob([data.text], { type: "text/plain" }),
    }),
  ]);
};
