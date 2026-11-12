import { assertEquals } from "@std/assert";
import { type DomNode, storyTree } from "./story-tree.ts";

const text = (value: string): DomNode => ({
  nodeType: 3,
  nodeName: "#text",
  nodeValue: value,
  childNodes: [],
});

const el = (
  name: string,
  attributes: Record<string, string>,
  ...children: Array<DomNode>
): DomNode => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  nodeValue: null,
  attributes: Object.entries(attributes).map(([n, value]) => ({ name: n, value })),
  childNodes: children,
});

Deno.test("a story's nodes become a tree, links opening in a new tab", () => {
  assertEquals(
    storyTree([
      el("p", { class: "x" }, text("Hi "), el("a", { href: "https://a.example/" }, text("there"))),
    ]),
    {
      type: "root",
      children: [{
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          { type: "text", value: "Hi " },
          {
            type: "element",
            tagName: "a",
            properties: {
              href: "https://a.example/",
              target: "_blank",
              rel: ["noopener", "noreferrer"],
            },
            children: [{ type: "text", value: "there" }],
          },
        ],
      }],
    },
  );
});

Deno.test("only plain tags, kept attributes and web URLs get through", () => {
  const tree = storyTree([
    el("script", {}, text("bad()")),
    el("img", { src: "javascript:x", onerror: "x()", alt: "A" }),
    el("img", { src: "https://a.example/i.png", srcset: "https://a.example/2.png 2x" }),
    el("source", { srcset: "https://a.example/a.png 1x, data:x 2x" }),
    el("a", { href: "mailto:a@b.example" }, text("mail")),
    el("td", { colspan: "2" }),
    { nodeType: 8, nodeName: "#comment", nodeValue: "hidden", childNodes: [] },
  ]);
  assertEquals(
    tree.children.map((c) => c.type === "element" ? [c.tagName, c.properties] : c.type),
    [
      ["img", { alt: "A" }],
      ["img", { src: "https://a.example/i.png", srcSet: "https://a.example/2.png 2x" }],
      ["source", {}],
      ["a", { href: "mailto:a@b.example", target: "_blank", rel: ["noopener", "noreferrer"] }],
      ["td", { colSpan: "2" }],
    ],
  );
});
