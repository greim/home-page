/**
 * What a paste comes to: a source, ready to preview; plain text whose kind the
 * widget must ask about; or nothing it can use.
 */
import { sanitizeHtml } from "./convert.ts";
import { bestGuess, detect } from "./detect.ts";
import type { HtmlNode } from "./html-to-markdown.ts";
import type { Kind, Source } from "./source.ts";

/** What was on the clipboard: its types, its HTML parsed (if any), and its plain text. */
export type Clip = {
  readonly types: ReadonlyArray<string>;
  readonly html: ReadonlyArray<HtmlNode> | null;
  readonly text: string;
};

export type PasteResult =
  | { readonly is: "ready"; readonly source: Source }
  | { readonly is: "ask"; readonly text: string }
  | { readonly is: "unsupported"; readonly types: ReadonlyArray<string> };

/** Elements that hold nothing to show, which editors put around what they copy. */
const ignoredTags = new Set(["meta", "style", "link", "title", "head", "script"]);

/** The nodes that matter: no blank text, no metadata, no html or body wrappers. */
const meaningful = (nodes: ReadonlyArray<HtmlNode>): ReadonlyArray<HtmlNode> =>
  nodes.flatMap((node) => {
    if (node.is === "text") return node.text.trim() === "" ? [] : [node];
    if (ignoredTags.has(node.tag)) return [];
    return node.tag === "html" || node.tag === "body" ? meaningful(node.children) : [node];
  });

/**
 * Whether the HTML is just one block of preformatted text, as code editors (VS
 * Code, JetBrains) and code views put on the clipboard: code dressed up in
 * colors, which is better read as the plain text beside it.
 */
export const isCodeCopy = (nodes: ReadonlyArray<HtmlNode>): boolean => {
  const [only, ...rest] = meaningful(nodes);
  if (only === undefined || rest.length > 0 || only.is === "text") return false;
  const style = (only.attrs["style"] ?? "").toLowerCase().replace(/\s+/g, "");
  return only.tag === "pre" || /(?:^|;)white-space:pre(?:-wrap)?(?:;|$)/.test(style);
};

export const readPaste = (clip: Clip): PasteResult => {
  if (clip.html !== null && !(isCodeCopy(clip.html) && clip.text.trim() !== "")) {
    const html = sanitizeHtml(clip.html);
    if (html.trim() !== "") return { is: "ready", source: { kind: "html", data: html } };
  }
  if (clip.text.trim() !== "") {
    const kind = detect(clip.text);
    return kind === null
      ? { is: "ask", text: clip.text }
      : { is: "ready", source: { kind, data: clip.text } };
  }
  return { is: "unsupported", types: clip.types.filter((t) => t !== "text/plain") };
};

/** The error for a paste with nothing the widget can use. */
export const unsupportedMessage = (types: ReadonlyArray<string>): string =>
  types.length === 0
    ? "There was nothing to paste."
    : `${types.join(", ")} ${types.length === 1 ? "isn't" : "aren't"} supported. ` +
      "Paste text, HTML, Markdown, code or JSON.";

/** An answer to "what kind of text is this?": a kind, or the widget's best guess. */
export type Choice = Kind | "guess";

/** The text as the kind chosen for it. */
export const chosenSource = (text: string, choice: Choice): Source => ({
  kind: choice === "guess" ? bestGuess(text) : choice,
  data: text,
});
