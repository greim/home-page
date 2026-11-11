/**
 * Turns HTML, as copied from a web page, into GitHub-flavored Markdown:
 * headings, paragraphs, lists, quotes, code, tables, bold, italics,
 * strikethrough, links and images. Anything else keeps its text.
 *
 * It works on a plain tree (HtmlNode) rather than the DOM, so it runs anywhere;
 * the widget builds the tree from the browser's parse of the clipboard.
 */

export type HtmlNode =
  | { readonly is: "text"; readonly text: string }
  | {
    readonly is: "element";
    /** Lowercase, e.g. "p". */
    readonly tag: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly children: ReadonlyArray<HtmlNode>;
  };

type HtmlElement = Extract<HtmlNode, { is: "element" }>;

/** Elements whose content isn't text to keep. */
const skippedTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "head",
  "title",
  "meta",
  "link",
  "svg",
  "canvas",
  "iframe",
  "input",
  "select",
  "textarea",
]);

/** Elements that start a block of their own; any other element is inline. */
const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "center",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const isElement = (node: HtmlNode): node is HtmlElement => node.is === "element";
/** Whether a node is or holds a block element, so can't be inline. */
const holdsBlock = (node: HtmlNode): boolean =>
  isElement(node) && !skippedTags.has(node.tag) &&
  (blockTags.has(node.tag) || node.children.some(holdsBlock));
const attr = (el: HtmlElement, name: string): string => el.attrs[name] ?? "";

/** A hard line break within a paragraph. */
const hardBreak = "\\\n";

/** Formatting already applied around inline content, so it isn't applied twice. */
type Inline = {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strike: boolean;
  readonly link: boolean;
};
const plain: Inline = { bold: false, italic: false, strike: false, link: false };

/** A rendered block; lists sit tight against what's before them inside list items. */
type Block = { readonly is: "list" | "other"; readonly text: string };

export const htmlToMarkdown = (nodes: ReadonlyArray<HtmlNode>): string =>
  joinBlocks(blocks(nodes), false).replace(/\n{3,}/g, "\n\n").trim();

const joinBlocks = (bs: ReadonlyArray<Block>, tight: boolean): string =>
  bs.map((b, i) => (i === 0 ? "" : tight && b.is === "list" ? "\n" : "\n\n") + b.text).join("");

/** Nodes as blocks: runs of inline nodes become paragraphs. */
const blocks = (nodes: ReadonlyArray<HtmlNode>): ReadonlyArray<Block> => {
  const out: Array<Block> = [];
  const run: Array<HtmlNode> = [];
  const flush = () => {
    const text = paragraph(run);
    if (text !== "") out.push({ is: "other", text });
    run.length = 0;
  };
  for (const node of nodes) {
    if (isElement(node) && skippedTags.has(node.tag)) continue;
    if (isElement(node) && blockTags.has(node.tag)) {
      flush();
      out.push(...block(node));
    } else if (isElement(node) && node.children.some(holdsBlock)) {
      // An inline element around blocks, like the <b> Google Docs wraps everything in.
      flush();
      out.push(...blocks(node.children));
    } else run.push(node);
  }
  flush();
  return out;
};

const block = (el: HtmlElement): ReadonlyArray<Block> => {
  const heading = /^h([1-6])$/.exec(el.tag);
  if (heading !== null) {
    const text = tidy(inline(el.children, { ...plain, bold: true })).replaceAll(hardBreak, " ");
    return text === "" ? [] : [{ is: "other", text: `${"#".repeat(Number(heading[1]))} ${text}` }];
  }
  switch (el.tag) {
    case "hr":
      return [{ is: "other", text: "---" }];
    case "pre":
      return [{ is: "other", text: codeBlock(el) }];
    case "ul":
    case "ol":
      return list(el);
    case "blockquote": {
      const text = joinBlocks(blocks(el.children), false);
      if (text === "") return [];
      return [{
        is: "other",
        text: text.split("\n").map((l) => l === "" ? ">" : `> ${l}`).join("\n"),
      }];
    }
    case "table":
      return table(el);
    default:
      return blocks(el.children);
  }
};

const indent = (text: string, by: number): string =>
  text.split("\n").map((l, i) => i === 0 || l === "" ? l : " ".repeat(by) + l).join("\n");

const list = (el: HtmlElement): ReadonlyArray<Block> => {
  const ordered = el.tag === "ol";
  const start = Number.parseInt(attr(el, "start"), 10);
  let n = Number.isNaN(start) ? 1 : start;
  let previousMarker = "- ";
  const lines: Array<string> = [];
  // Content not in an item (a list nested straight inside a list, or text put
  // loose in the list, which some pages do): it belongs to the item before it.
  const loose: Array<HtmlNode> = [];
  const flushLoose = () => {
    const content = joinBlocks(blocks(loose), true);
    loose.length = 0;
    if (content === "") return;
    const nested = " ".repeat(previousMarker.length) + indent(content, previousMarker.length);
    lines.push(lines.length === 0 ? content : nested);
  };
  for (const child of el.children) {
    if (isElement(child) && skippedTags.has(child.tag)) continue;
    if (!isElement(child) || child.tag !== "li") {
      loose.push(child);
      continue;
    }
    flushLoose();
    const content = joinBlocks(blocks(child.children), true);
    const marker = ordered ? `${n++}. ` : "- ";
    previousMarker = marker;
    lines.push(content === "" ? marker.trimEnd() : marker + indent(content, marker.length));
  }
  flushLoose();
  return lines.length === 0 ? [] : [{ is: "list", text: lines.join("\n") }];
};

/** Text exactly as written, for code; line breaks and line-sized elements become newlines. */
const rawText = (node: HtmlNode): string => {
  if (!isElement(node)) return node.text;
  // Buttons in code are its "Copy" buttons; elsewhere they may be headings or labels.
  if (skippedTags.has(node.tag) || node.tag === "button") return "";
  if (node.tag === "br") return "\n";
  const text = node.children.map(rawText).join("");
  return ["div", "p", "li", "tr"].includes(node.tag) && !text.endsWith("\n") ? text + "\n" : text;
};

const longestRun = (text: string, char: string): number =>
  Math.max(0, ...Array.from(text.matchAll(new RegExp(`\\${char}+`, "g")), (m) => m[0].length));

const languageOf = (el: HtmlElement): string => {
  const code = el.children.find((c) => isElement(c) && c.tag === "code");
  const classes = `${attr(el, "class")} ${
    code !== undefined && isElement(code) ? attr(code, "class") : ""
  }`;
  return /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(classes)?.[1] ?? "";
};

const codeBlock = (el: HtmlElement): string => {
  const code = rawText(el).replace(/^\n/, "").trimEnd();
  const fence = "`".repeat(Math.max(3, longestRun(code, "`") + 1));
  return `${fence}${languageOf(el)}\n${code}\n${fence}`;
};

const rowsOf = (el: HtmlElement): ReadonlyArray<HtmlElement> =>
  el.children.filter(isElement).flatMap((c) =>
    c.tag === "tr" ? [c] : ["thead", "tbody", "tfoot"].includes(c.tag) ? rowsOf(c) : []
  );

const cellText = (cell: HtmlElement): string =>
  tidy(inline(cell.children, { ...plain, bold: cell.tag === "th" }))
    .replaceAll(hardBreak, "<br>")
    .replaceAll("|", "\\|");

/** A table, the first row as its header, its columns padded to line up. */
const table = (el: HtmlElement): ReadonlyArray<Block> => {
  const rows = rowsOf(el).map((row) =>
    row.children.filter((c) => isElement(c) && (c.tag === "td" || c.tag === "th"))
      .filter(isElement).map(cellText)
  ).filter((cells) => cells.length > 0);
  if (rows.length === 0) return [];
  const columns = Math.max(...rows.map((cells) => cells.length));
  const widths = Array.from(
    { length: columns },
    (_, i) => Math.max(3, ...rows.map((cells) => (cells.at(i) ?? "").length)),
  );
  const line = (cells: ReadonlyArray<string>) =>
    `| ${widths.map((w, i) => (cells.at(i) ?? "").padEnd(w)).join(" | ")} |`;
  const [header = [], ...body] = rows;
  const rule = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
  return [{ is: "other", text: [line(header), rule, ...body.map(line)].join("\n") }];
};

/** Escapes characters that would otherwise read as Markdown. */
const escape = (text: string): string =>
  text.replace(/[\\`*_[\]]/g, "\\$&").replace(/<(?=[A-Za-z/!?])/g, "\\<");

/** Inline text with its spacing settled: single spaces, none around line breaks or at the ends. */
const tidy = (text: string): string =>
  text.replace(/ {2,}/g, " ")
    .replace(/ *\\\n */g, hardBreak)
    .replace(/^(?:\s|\\\n)+|(?:\s|\\\n)+$/g, "");

/** A paragraph of inline nodes, escaped so it doesn't start like a heading, list or quote. */
const paragraph = (nodes: ReadonlyArray<HtmlNode>): string =>
  tidy(inline(nodes, plain))
    .replace(/^(\d+)([.)] )/, "$1\\$2")
    .replace(/^(#|>|[-+](?= ))/, "\\$1");

const inline = (nodes: ReadonlyArray<HtmlNode>, ctx: Inline): string =>
  nodes.map((node) => inlineNode(node, ctx)).join("");

/** Wraps content in markers, keeping its surrounding whitespace outside them. */
const wrap = (open: string, close: string, text: string): string => {
  const m = /^((?:\s|\\\n)*)([\s\S]*?)((?:\s|\\\n)*)$/.exec(text);
  const [, lead = "", inner = "", trail = ""] = m ?? [];
  return inner === "" ? text : `${lead}${open}${inner}${close}${trail}`;
};

const urlOf = (href: string): string =>
  href.trim().replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29");

const codeSpan = (text: string): string => {
  if (text.trim() === "") return text;
  const ticks = "`".repeat(longestRun(text, "`") + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
};

const styleOf = (el: HtmlElement): ReadonlyMap<string, string> =>
  new Map(
    attr(el, "style").split(";").flatMap((decl) => {
      const at = decl.indexOf(":");
      return at < 0
        ? []
        : [[decl.slice(0, at).trim().toLowerCase(), decl.slice(at + 1).trim().toLowerCase()]];
    }),
  );

/**
 * Whether an element makes its text bold, italic or struck through, by its tag
 * or by its inline style, which wins (Google Docs wraps everything in a <b>
 * styled not bold, and marks bold with a style on a <span>).
 */
const formatting = (el: HtmlElement) => {
  const style = styleOf(el);
  const weight = style.get("font-weight");
  const fontStyle = style.get("font-style");
  const decoration = style.get("text-decoration") ?? style.get("text-decoration-line");
  return {
    bold: weight === undefined
      ? el.tag === "b" || el.tag === "strong"
      : weight === "bold" || weight === "bolder" || Number(weight) >= 600,
    italic: fontStyle === undefined
      ? el.tag === "i" || el.tag === "em"
      : fontStyle === "italic" || fontStyle === "oblique",
    strike: ["s", "del", "strike"].includes(el.tag) || (decoration ?? "").includes("line-through"),
  };
};

const inlineNode = (node: HtmlNode, ctx: Inline): string => {
  if (!isElement(node)) return escape(node.text.replace(/\s+/g, " "));
  const el = node;
  if (skippedTags.has(el.tag)) return "";
  switch (el.tag) {
    case "br":
      return hardBreak;
    case "img": {
      const src = attr(el, "src");
      const alt = escape(attr(el, "alt").replace(/\s+/g, " ").trim());
      return src === "" || src.startsWith("data:") ? alt : `![${alt}](${urlOf(src)})`;
    }
    case "code":
    case "kbd":
    case "samp":
    case "tt":
      return codeSpan(rawText(el).replace(/\s+/g, " "));
    case "a": {
      const href = attr(el, "href").trim();
      const content = inline(el.children, { ...ctx, link: true });
      const linkable = !ctx.link && href !== "" && !href.startsWith("#") &&
        !href.toLowerCase().startsWith("javascript:");
      return linkable ? wrap("[", `](${urlOf(href)})`, content) : content;
    }
  }
  if (blockTags.has(el.tag)) return ` ${inline(el.children, ctx)} `;
  const f = formatting(el);
  const bold = f.bold && !ctx.bold;
  const italic = f.italic && !ctx.italic;
  const strike = f.strike && !ctx.strike;
  const content = inline(el.children, {
    ...ctx,
    bold: ctx.bold || bold,
    italic: ctx.italic || italic,
    strike: ctx.strike || strike,
  });
  const struck = strike ? wrap("~~", "~~", content) : content;
  const slanted = italic ? wrap("*", "*", struck) : struck;
  return bold ? wrap("**", "**", slanted) : slanted;
};
