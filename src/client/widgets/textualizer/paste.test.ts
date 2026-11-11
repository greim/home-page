import { assertEquals } from "@std/assert";
import type { HtmlNode } from "./html-to-markdown.ts";
import { chosenSource, isCodeCopy, readPaste, unsupportedMessage } from "./paste.ts";

const text = (t: string): HtmlNode => ({ is: "text", text: t });
const el = (
  tag: string,
  children: ReadonlyArray<HtmlNode>,
  attrs: Record<string, string> = {},
): HtmlNode => ({ is: "element", tag, attrs, children });

/** What VS Code puts on the clipboard: a meta, then one div styled white-space: pre. */
const vsCode: ReadonlyArray<HtmlNode> = [
  el("meta", [], { charset: "utf-8" }),
  el("div", [el("div", [el("span", [text("const a = 1;")], { style: "color: #569cd6;" })])], {
    style: "color: #d4d4d4;font-family: Menlo;white-space: pre;",
  }),
];
/** What JetBrains IDEs put there: a whole document around one pre. */
const jetBrains: ReadonlyArray<HtmlNode> = [
  el("html", [
    el("head", [el("meta", [])]),
    el("body", [text("\n"), el("pre", [text("val a = 1")], { style: "color:#a9b7c6;" })]),
  ]),
];
const webPage: ReadonlyArray<HtmlNode> = [
  el("h1", [text("Title")]),
  el("p", [text("Body "), el("em", [text("text")])]),
];

Deno.test("isCodeCopy: code from editors", () => {
  assertEquals(isCodeCopy(vsCode), true);
  assertEquals(isCodeCopy(jetBrains), true);
  assertEquals(
    isCodeCopy([el("div", [text("x")], { style: "WHITE-SPACE: pre-wrap" })]),
    true,
  );
});

Deno.test("isCodeCopy: not other HTML", () => {
  assertEquals(isCodeCopy(webPage), false);
  assertEquals(isCodeCopy([el("div", [text("x")], { style: "white-space: nowrap" })]), false);
  assertEquals(isCodeCopy([text("just text")]), false);
  assertEquals(isCodeCopy([]), false);
});

Deno.test("readPaste: HTML is sanitized", () => {
  assertEquals(readPaste({ types: ["text/html"], html: webPage, text: "Title Body text" }), {
    is: "ready",
    source: { kind: "html", data: "<h1>Title</h1>\n<p>Body <em>text</em></p>" },
  });
});

Deno.test("readPaste: code from an editor is read as its plain text", () => {
  assertEquals(
    readPaste({
      types: ["text/plain", "text/html"],
      html: vsCode,
      text: "import a from 'a';\nexport const b = a;",
    }),
    { is: "ready", source: { kind: "script", data: "import a from 'a';\nexport const b = a;" } },
  );
});

Deno.test("readPaste: code-like HTML with no plain text is still HTML", () => {
  const result = readPaste({ types: ["text/html"], html: vsCode, text: "" });
  assertEquals(result.is === "ready" && result.source.kind, "html");
});

Deno.test("readPaste: HTML with nothing in it falls back to the text", () => {
  assertEquals(
    readPaste({ types: ["text/html", "text/plain"], html: [el("script", [])], text: "{}" }),
    { is: "ready", source: { kind: "json", data: "{}" } },
  );
});

Deno.test("readPaste: plain text of a clear kind", () => {
  assertEquals(readPaste({ types: ["text/plain"], html: null, text: "# Hi\n\n- a" }), {
    is: "ready",
    source: { kind: "markdown", data: "# Hi\n\n- a" },
  });
});

Deno.test("readPaste: plain text of no clear kind is asked about", () => {
  assertEquals(readPaste({ types: ["text/plain"], html: null, text: "Hello there." }), {
    is: "ask",
    text: "Hello there.",
  });
});

Deno.test("readPaste: nothing usable", () => {
  assertEquals(readPaste({ types: ["Files", "image/png"], html: null, text: "" }), {
    is: "unsupported",
    types: ["Files", "image/png"],
  });
  assertEquals(readPaste({ types: ["text/plain"], html: null, text: "  " }), {
    is: "unsupported",
    types: [],
  });
});

Deno.test("unsupportedMessage", () => {
  assertEquals(unsupportedMessage([]), "There was nothing to paste.");
  assertEquals(
    unsupportedMessage(["image/png"]),
    "image/png isn't supported. Paste text, HTML, Markdown, code or JSON.",
  );
  assertEquals(
    unsupportedMessage(["Files", "image/png"]),
    "Files, image/png aren't supported. Paste text, HTML, Markdown, code or JSON.",
  );
});

Deno.test("chosenSource: the kind chosen, or the best guess", () => {
  assertEquals(chosenSource("a", "json"), { kind: "json", data: "a" });
  assertEquals(chosenSource("Plain words.", "guess"), { kind: "markdown", data: "Plain words." });
});
