import { assertEquals, assertStringIncludes } from "@std/assert";
import { toHtml } from "hast-util-to-html";
import {
  clipboardData,
  codeTree,
  fenced,
  formattedHtml,
  markdownOf,
  markdownToHtml,
  sanitizeHtml,
} from "./convert.ts";
import type { HtmlNode } from "./html-to-markdown.ts";

const text = (t: string): HtmlNode => ({ is: "text", text: t });
const el = (
  tag: string,
  children: ReadonlyArray<HtmlNode>,
  attrs: Record<string, string> = {},
): HtmlNode => ({ is: "element", tag, attrs, children });

/** A paragraph with bold, a script, and an iframe. */
const pasted: ReadonlyArray<HtmlNode> = [
  el("p", [text("Hello "), el("strong", [text("world")])], { onclick: "evil()" }),
  el("script", [text("evil()")]),
  el("iframe", [], { src: "https://example.com" }),
];
/** Parses any HTML to `pasted`, standing in for the browser's parser. */
const parse = () => pasted;

Deno.test("markdownToHtml: renders GitHub-flavored Markdown", () => {
  assertEquals(markdownToHtml("# Hi\n\n~~old~~"), "<h1>Hi</h1>\n<p><del>old</del></p>");
  assertStringIncludes(markdownToHtml("| a |\n| - |\n| 1 |"), "<td>1</td>");
});

Deno.test("markdownToHtml: leaves out HTML written in the Markdown", () => {
  assertEquals(markdownToHtml("<script>evil()</script>"), "");
  assertEquals(markdownToHtml("a <img src=x onerror=evil()> b"), "<p>a  b</p>");
});

Deno.test("markdownToHtml: drops unsafe links but keeps safe ones", () => {
  assertEquals(markdownToHtml("[x](javascript:evil())"), "<p><a>x</a></p>");
  assertEquals(markdownToHtml("![x](data:image/png;base64,AA)"), '<p><img alt="x"></p>');
  assertEquals(
    markdownToHtml("[a](https://e.com) [b](/p) [c](#h) [d](mailto:a@b.c) [e](page.html)"),
    '<p><a href="https://e.com">a</a> <a href="/p">b</a> <a href="#h">c</a> ' +
      '<a href="mailto:a@b.c">d</a> <a href="page.html">e</a></p>',
  );
});

Deno.test("sanitizeHtml: keeps the text and formatting, nothing else", () => {
  assertEquals(sanitizeHtml(pasted), "<p>Hello <strong>world</strong></p>");
});

Deno.test("codeTree: code in a monospace block, escaped as HTML", () => {
  const html = toHtml(codeTree("a < b && c"));
  assertStringIncludes(html, "a &#x3C; b &#x26;&#x26; c</pre>");
  assertStringIncludes(html, "white-space: pre");
});

Deno.test("fenced: a fence longer than any backticks inside", () => {
  assertEquals(fenced("let a = 1;\n", "typescript"), "```typescript\nlet a = 1;\n```");
  assertEquals(fenced("````", "json"), "`````json\n````\n`````");
});

Deno.test("formattedHtml: each kind", () => {
  assertStringIncludes(formattedHtml({ kind: "script", data: "x<1" }, parse), "x&#x3C;1</pre>");
  assertStringIncludes(formattedHtml({ kind: "json", data: "{}" }, parse), "{}</pre>");
  assertEquals(formattedHtml({ kind: "markdown", data: "*a*" }, parse), "<p><em>a</em></p>");
  assertEquals(
    formattedHtml({ kind: "html", data: "ignored" }, parse),
    "<p>Hello <strong>world</strong></p>",
  );
});

Deno.test("markdownOf: each kind", () => {
  assertEquals(markdownOf({ kind: "script", data: "f()" }, parse), "```typescript\nf()\n```");
  assertEquals(markdownOf({ kind: "json", data: "[]" }, parse), "```json\n[]\n```");
  assertEquals(markdownOf({ kind: "markdown", data: "# a" }, parse), "# a");
  assertEquals(markdownOf({ kind: "html", data: "ignored" }, parse), "Hello **world**");
});

Deno.test("clipboardData: each format", () => {
  const md = { kind: "markdown", data: "**b**" } as const;
  assertEquals(clipboardData("source", md, parse), { is: "text", text: "**b**" });
  assertEquals(clipboardData("markdown", md, parse), { is: "text", text: "**b**" });
  assertEquals(clipboardData("html", md, parse), { is: "text", text: "<p><strong>b</strong></p>" });
  assertEquals(clipboardData("formatted", md, parse), {
    is: "rich",
    html: "<p><strong>b</strong></p>",
    text: "**b**",
  });
});

Deno.test("clipboardData: formatted code falls back to the code itself", () => {
  const data = clipboardData("formatted", { kind: "json", data: "{}" }, parse);
  assertEquals(data.is === "rich" && data.text, "{}");
});
