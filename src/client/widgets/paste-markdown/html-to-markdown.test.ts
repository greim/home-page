import { assertEquals } from "@std/assert";
import { type HtmlNode, htmlToMarkdown } from "./html-to-markdown.ts";

type Child = HtmlNode | string;
const node = (c: Child): HtmlNode => typeof c === "string" ? { is: "text", text: c } : c;

/** An element: `h("a", { href: "x" }, "text")`, or `h("p", "text")` with no attributes. */
const h = (
  tag: string,
  attrsOrChild?: Record<string, string> | Child,
  ...children: ReadonlyArray<Child>
): HtmlNode => {
  const hasAttrs = attrsOrChild !== undefined && typeof attrsOrChild !== "string" &&
    !("is" in attrsOrChild);
  const all = hasAttrs || attrsOrChild === undefined
    ? children
    : [attrsOrChild as Child, ...children];
  return {
    is: "element",
    tag,
    attrs: hasAttrs ? attrsOrChild as Record<string, string> : {},
    children: all.map(node),
  };
};

const md = (...nodes: ReadonlyArray<Child>) => htmlToMarkdown(nodes.map(node));

Deno.test("headings and paragraphs, with whitespace collapsed", () => {
  assertEquals(
    md(h("h1", " Title "), "\n  ", h("p", "Some\n   text."), h("h3", h("strong", "Sub"))),
    "# Title\n\nSome text.\n\n### Sub",
  );
});

Deno.test("bold, italics and strikethrough, with spaces kept outside the markers", () => {
  assertEquals(
    md(h("p", "a", h("b", " bold "), "and ", h("em", "it"), " ", h("del", "gone"))),
    "a **bold** and *it* ~~gone~~",
  );
  assertEquals(md(h("p", h("strong", "x ", h("b", "y")))), "**x y**");
  assertEquals(md(h("p", h("i", ""))), "");
});

Deno.test("formatting by inline style, as Google Docs pastes it", () => {
  assertEquals(
    md(
      h(
        "b",
        { style: "font-weight:normal;", id: "docs-internal-guid-1" },
        h(
          "p",
          h("span", { style: "font-weight: 700" }, "Bold"),
          " and ",
          h("span", { style: "font-style:italic" }, "it"),
        ),
        h(
          "p",
          h("span", { style: "text-decoration: line-through" }, "old"),
          h("i", { style: "font-style: normal" }, " plain"),
        ),
      ),
    ),
    "**Bold** and *it*\n\n~~old~~ plain",
  );
});

Deno.test("links and images", () => {
  assertEquals(
    md(h("p", "See ", h("a", { href: "https://x.com/a b(c)" }, h("b", "this")), ".")),
    "See [**this**](https://x.com/a%20b%28c%29).",
  );
  assertEquals(
    md(
      h("p", h("a", { href: "#top" }, "anchor"), " ", h("a", { href: "javascript:void 0" }, "js")),
    ),
    "anchor js",
  );
  assertEquals(
    md(h("p", h("a", { href: "/x" }, h("a", { href: "/y" }, "nested")))),
    "[nested](/x)",
  );
  assertEquals(md(h("p", h("a", { href: "/x" }, " "))), "");
  assertEquals(
    md(
      h(
        "p",
        h("img", { src: "https://x.com/i.png", alt: "An  image" }),
        h("img", { src: "data:x", alt: "inline" }),
        h("img", {}),
      ),
    ),
    "![An image](https://x.com/i.png)inline",
  );
});

Deno.test("escapes text that would read as Markdown", () => {
  assertEquals(
    md(h("p", "a*b_c [d] `e` \\ <div> 1 < 2")),
    "a\\*b\\_c \\[d\\] \\`e\\` \\\\ \\<div> 1 < 2",
  );
  assertEquals(md(h("p", "# not a heading")), "\\# not a heading");
  assertEquals(md(h("p", "- not a list")), "\\- not a list");
  assertEquals(md(h("p", "1. not a list")), "1\\. not a list");
});

Deno.test("line breaks", () => {
  assertEquals(md(h("p", h("br"), "one ", h("br"), " two", h("br"))), "one\\\ntwo");
  assertEquals(md(h("h2", "a", h("br"), "b")), "## a b");
});

Deno.test("inline code", () => {
  assertEquals(md(h("p", "Run ", h("code", "npm   i"), ".")), "Run `npm i`.");
  assertEquals(md(h("p", h("code", "a`b"))), "``a`b``");
  assertEquals(md(h("p", h("kbd", "`"))), "`` ` ``");
  assertEquals(md(h("p", "x", h("code", " "), "y")), "x y");
});

Deno.test("code blocks keep their text, and take a language from their class", () => {
  assertEquals(
    md(h("pre", { class: "language-ts" }, "\nconst a = 1;\n", h("span", "a  *b*"), "\n")),
    "```ts\nconst a = 1;\na  *b*\n```",
  );
  assertEquals(
    md(h("pre", h("code", { class: "lang-sh" }, "echo ```", h("br"), "x"))),
    "````sh\necho ```\nx\n````",
  );
  assertEquals(
    md(h("pre", h("div", "one"), h("div", "two", h("button", "Copy")))),
    "```\none\ntwo\n```",
  );
});

Deno.test("lists, nested and numbered", () => {
  assertEquals(
    md(
      h("ul", h("li", "a"), h("li", "b", h("ul", h("li", "c"), h("li")))),
      h(
        "ol",
        { start: "3" },
        h("li", h("p", "x"), h("p", "y")),
        "\n",
        h("li", "z", h("ol", h("li", "w"))),
      ),
    ),
    "- a\n- b\n  - c\n  -\n\n3. x\n\n   y\n4. z\n   1. w",
  );
});

Deno.test("a list nested straight inside a list belongs to the item before it", () => {
  assertEquals(md(h("ul", h("li", "a"), h("ul", h("li", "b")))), "- a\n  - b");
  assertEquals(md(h("ol", h("ul", h("li", "b")), h("script", "x"), h("div"))), "- b");
  assertEquals(md(h("ul", h("style", "x"))), "");
});

Deno.test("keeps buttons' text, as in this page's bookmark headings", () => {
  assertEquals(
    md(
      h("h3", h("button", { "aria-expanded": "true" }, "Headlines")),
      h("ul", h("li", h("button", "Folder"))),
    ),
    "### Headlines\n\n- Folder",
  );
});

Deno.test("block quotes", () => {
  assertEquals(
    md(h("blockquote", h("p", "one"), h("p", "two"))),
    "> one\n>\n> two",
  );
  assertEquals(md(h("blockquote", " ")), "");
});

Deno.test("tables, padded, with the first row as the header", () => {
  assertEquals(
    md(
      h(
        "table",
        h("thead", h("tr", h("th", "Name"), h("th", h("b", "Notes")))),
        h("tbody", h("tr", h("td", "a|b"), h("td", "x", h("br"), "y")), h("tr", h("td", "c"))),
        h("tr"),
      ),
    ),
    "| Name | Notes  |\n| ---- | ------ |\n| a\\|b | x<br>y |\n| c    |        |",
  );
  assertEquals(md(h("table", h("caption", "nothing"))), "");
});

Deno.test("skips what isn't content, and keeps the text of what it doesn't know", () => {
  assertEquals(
    md(
      h(
        "html",
        h("head", h("title", "T")),
        h(
          "body",
          h("script", "x"),
          h("hr"),
          h("dl", h("dt", "term"), h("dd", "def")),
          h("span", "loose ", h("sup", "1")),
          h("svg"),
        ),
      ),
    ),
    "---\n\nterm\n\ndef\n\nloose 1",
  );
  assertEquals(md(h("h2", "a", h("div", "b"))), "## a b");
  assertEquals(md(h("p", h("a", { href: "/x" }, "a ", h("div", "b")), " c")), "a\n\nb\n\nc");
});
