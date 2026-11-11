/**
 * What the textualizer holds: the text pasted in, and what kind of text it is. It's
 * the canonical copy; the preview and every "Copy as" are made from it.
 */

/** The kinds of text the textualizer knows. "script" is TypeScript or JavaScript. */
export const kinds = ["markdown", "html", "script", "json"] as const;
export type Kind = typeof kinds[number];

export type Source = { readonly kind: Kind; readonly data: string };

/** Each kind, as its badge and buttons name it. */
export const kindLabels: Readonly<Record<Kind, string>> = {
  markdown: "Markdown",
  html: "HTML",
  script: "TS/JS",
  json: "JSON",
};

/** Whether the grammar checker can check this kind: prose, not code or data. */
export const checkable = (kind: Kind): boolean => kind === "markdown" || kind === "html";
