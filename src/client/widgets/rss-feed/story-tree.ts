/**
 * A story's HTML (sanitized by the feeds API) as a hast tree, to render as React
 * elements. It's given the nodes the browser's DOMParser made of it, and keeps only
 * elements with plain tag names and the attributes a story needs, with http(s)
 * links and images: a second check after the server's. Plain data in, so tests need
 * no browser.
 */
import type { ElementContent, Properties, Root } from "hast";

/** The parts of a DOM node this reads. */
export type DomNode = {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly attributes?: ArrayLike<{ readonly name: string; readonly value: string }>;
  readonly childNodes: ArrayLike<DomNode>;
};

const elementNode = 1;
const textNode = 3;

/** Each attribute kept, by its hast property name. */
const propertyNames: Readonly<Record<string, string>> = {
  href: "href",
  src: "src",
  srcset: "srcSet",
  alt: "alt",
  title: "title",
  loading: "loading",
  colspan: "colSpan",
  rowspan: "rowSpan",
  type: "type",
  media: "media",
};

/** Never rendered, whatever the server let through. */
const dropped = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "link",
  "meta",
  "base",
]);

const isWebUrl = (value: string, mailto: boolean) =>
  /^https?:\/\//i.test(value) || (mailto && /^mailto:/i.test(value));

const propertiesOf = (tag: string, node: DomNode): Properties => {
  const props: Properties = {};
  for (const { name, value } of Array.from(node.attributes ?? [])) {
    const key = propertyNames[name.toLowerCase()];
    if (key === undefined) continue;
    if (key === "href" && !isWebUrl(value, true)) continue;
    if (key === "src" && !isWebUrl(value, false)) continue;
    if (key === "srcSet" && !value.split(",").every((c) => isWebUrl(c.trim(), false))) continue;
    props[key] = value;
  }
  if (tag === "a") {
    props.target = "_blank";
    props.rel = ["noopener", "noreferrer"];
  }
  return props;
};

const contentOf = (nodes: ArrayLike<DomNode>): Array<ElementContent> =>
  Array.from(nodes).flatMap((node): Array<ElementContent> => {
    if (node.nodeType === textNode) return [{ type: "text", value: node.nodeValue ?? "" }];
    if (node.nodeType !== elementNode) return [];
    const tag = node.nodeName.toLowerCase();
    if (!/^[a-z][a-z0-9]*$/.test(tag) || dropped.has(tag)) return [];
    return [{
      type: "element",
      tagName: tag,
      properties: propertiesOf(tag, node),
      children: contentOf(node.childNodes),
    }];
  });

/** The tree of a parsed story's nodes (its body's children). */
export const storyTree = (nodes: ArrayLike<DomNode>): Root => ({
  type: "root",
  children: contentOf(nodes),
});
