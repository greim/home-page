/**
 * Guesses what kind of text some plain text is (Markdown, HTML, TypeScript or
 * JavaScript, JSON) from patterns in it. Each kind gets a score from 0 to 1; the
 * text is the kind that scores highest, if it scores high enough and clearly
 * beats the rest. Otherwise the widget asks.
 */
import { Either } from "effect";
import { type Kind, kinds } from "./source.ts";

export type Scores = Readonly<Record<Kind, number>>;

/** Lowest score that counts as a match. */
export const threshold = 0.5;
/** How far the top score must beat the next, so a close call is asked about. */
export const margin = 0.15;

const lines = (text: string): ReadonlyArray<string> =>
  text.split(/\r?\n/).filter((l) => l.trim() !== "");

const fraction = (ls: ReadonlyArray<string>, test: (line: string) => boolean): number =>
  ls.length === 0 ? 0 : ls.filter(test).length / ls.length;

/** The text with fenced code blocks taken out, so code in Markdown doesn't count as code. */
const unfenced = (text: string): string =>
  text.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm, "");

const jsonScore = (text: string): number => {
  const t = text.trim();
  const shaped = (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
  if (!shaped) return 0;
  // Not valid JSON: perhaps JSON with a slip, perhaps a JavaScript literal.
  return Either.isRight(Either.try(() => JSON.parse(t))) ? 1 : 0.3;
};

const htmlTags = new Set(
  ("a abbr address article aside b blockquote body br button caption code col dd del details " +
    "div dl dt em figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html i img " +
    "input label li link main meta nav ol p pre s section small span strong style sub summary " +
    "sup table tbody td template textarea tfoot th thead title tr u ul video script iframe")
    .split(" "),
);

const htmlScore = (text: string): number => {
  const t = text.trim();
  if (/^<!doctype html|^<html[\s>]/i.test(t)) return 1;
  const tags = Array.from(t.matchAll(/<\/?([a-z][a-z0-9]*)\b[^<>]*>/gi))
    .filter((m) => htmlTags.has((m[1] ?? "").toLowerCase()));
  const closing = tags.filter((m) => m[0].startsWith("</")).length;
  if (closing === 0) return 0;
  const tagLines = fraction(lines(t), (l) => l.trim().startsWith("<"));
  return Math.min(1, 0.2 + (t.startsWith("<") ? 0.2 : 0) + 0.6 * tagLines);
};

/** A line that starts like a statement or declaration. */
const keywordLine =
  /^\s*(?:import\s|export\s|const\s|let\s|var\s|(?:async\s+)?function[\s*(]|class\s|interface\s|type\s+\w+(?:<[^>]*>)?\s*=|enum\s|return\b|if\s*\(|}?\s*else\b|for\s*\(|while\s*\(|switch\s*\(|case\s|try\s*{|}?\s*catch\b|throw\s|await\s|module\.exports|require\()/;

/** A line that reads like code: a statement, a brace, an arrow, a comment, a call. */
const codeLine = (line: string): boolean =>
  keywordLine.test(line) ||
  /[;{}[(,]\s*$/.test(line) ||
  /^\s*[}\])]/.test(line) ||
  /=>/.test(line) ||
  /^\s*(?:\/\/|\/\*|\*)/.test(line) ||
  /^\s*[\w$.]+\s*(?:\(.*\)|=\s*.+);?\s*$/.test(line) && !/[.!?]["')]?\s*$/.test(line);

const scriptScore = (text: string): number => {
  const ls = lines(text);
  if (ls.length === 0) return 0;
  const keywords = ls.filter((l) => keywordLine.test(l)).length;
  return Math.min(1, 0.8 * fraction(ls, codeLine) + (keywords > 0 ? 0.2 : 0));
};

/** Markdown features, and what finding each is worth. */
const markdownFeatures: ReadonlyArray<readonly [RegExp, number]> = [
  [/^#{1,6}[ \t]+\S/m, 0.5], // heading
  [/^[ \t]*(?:`{3,}|~{3,})/m, 0.6], // fenced code
  [/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m, 0.6], // table rule
  [/^[ \t]*[-*+][ \t]+\S/m, 0.3], // bullet list
  [/^[ \t]*\d+[.)][ \t]+\S/m, 0.3], // numbered list
  [/^>[ \t]?\S/m, 0.3], // quote
  [/!?\[[^\]\n]+\]\([^)\s]+\)/, 0.4], // link or image
  [/\*\*[^*\n]+\*\*|__[^_\n]+__/, 0.3], // bold
  [/(?:^|[^\w`])`[^`\n]+`(?:[^\w`]|$)/, 0.25], // inline code
  [/^[ \t]*[-*+][ \t]+\[[ xX]\]/m, 0.3], // task list
];

const markdownScore = (text: string): number =>
  Math.min(1, markdownFeatures.reduce((sum, [re, worth]) => re.test(text) ? sum + worth : sum, 0));

/** How much the text looks like each kind. */
export const scores = (text: string): Scores => {
  const prose = unfenced(text);
  return {
    json: jsonScore(text),
    html: htmlScore(prose),
    script: scriptScore(prose),
    markdown: markdownScore(text),
  };
};

const ranked = (s: Scores): ReadonlyArray<readonly [Kind, number]> =>
  kinds.map((k) => [k, s[k]] as const).toSorted((a, b) => b[1] - a[1]);

/** The kind the text clearly is, or null if it's not clear. */
export const detect = (text: string): Kind | null => {
  const [top, next] = ranked(scores(text));
  if (top === undefined || top[1] < threshold) return null;
  return next === undefined || top[1] - next[1] >= margin ? top[0] : null;
};

/** The kind the text most looks like, however little: Markdown if nothing at all. */
export const bestGuess = (text: string): Kind => {
  const [top] = ranked(scores(text));
  return top === undefined || top[1] === 0 ? "markdown" : top[0];
};
