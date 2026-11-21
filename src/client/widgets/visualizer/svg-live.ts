/**
 * A chart's SVG, ready to put in the page: the agent's tool renders it with Vega, which
 * escapes text, from a spec that may not link or load anything (chart.ts). Still, as
 * it's put straight into the page, anything that could run or fetch is taken out here,
 * and its fixed size is dropped so it scales to the width it's shown at.
 */

const allowedTags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "defs",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
]);

const strip = (element: Element): void => {
  for (const child of Array.from(element.children)) {
    if (!allowedTags.has(child.tagName.toLowerCase())) child.remove();
    else strip(child);
  }
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const external = (name === "href" || name.endsWith(":href")) && !attr.value.startsWith("#");
    const url = /url\(\s*['"]?(?!#)/i.test(attr.value);
    if (name.startsWith("on") || external || url) element.removeAttribute(attr.name);
  }
};

let renders = 0;

/**
 * Makes the SVG's IDs (Vega's clip paths and gradients: "clip1"…) unique to this copy,
 * and its references to them, since every chart on the page has the same ones.
 */
const uniqueIds = (root: Element): void => {
  const prefix = `chart${++renders}-`;
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (element.id !== "") element.id = prefix + element.id;
    for (const attr of Array.from(element.attributes)) {
      const value = attr.value.replace(/url\(\s*(['"]?)#/g, `url($1#${prefix}`)
        .replace(/^#/, (name) => attr.name.endsWith("href") ? `#${prefix}` : name);
      if (value !== attr.value) element.setAttribute(attr.name, value);
    }
  }
};

/** The SVG, cleaned and made to scale, as an element for this page; null if it isn't an SVG. */
export const cleanSvg = (text: string): Element | null => {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror") !== null) {
    return null;
  }
  strip(root);
  uniqueIds(root);
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("role", "img");
  return document.importNode(root, true);
};
