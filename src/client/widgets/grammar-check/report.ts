/**
 * The grammar check agent's report, and what the widget does with it: finding each
 * issue in the text, and applying a suggested fix.
 */
import { Schema } from "effect";

export const IssueKind = Schema.Literal(
  "grammar",
  "spelling",
  "punctuation",
  "wording",
  "clarity",
  "readability",
);
export type IssueKind = typeof IssueKind.Type;

export const Issue = Schema.Struct({
  excerpt: Schema.String.annotations({
    description: "The exact words with the problem, copied character for character from the " +
      "text (same case, spacing and punctuation), long enough to be unique in it",
  }),
  kind: IssueKind,
  problem: Schema.String.annotations({ description: "What's wrong, in one short sentence" }),
  suggestion: Schema.String.annotations({
    description: "The excerpt rewritten to fix the problem: a drop-in replacement for it",
  }),
});
export type Issue = typeof Issue.Type;

export const GrammarReport = Schema.Struct({
  summary: Schema.String.annotations({
    description: "How clear and readable the text is overall, and its main weaknesses, in two " +
      "or three sentences",
  }),
  issues: Schema.Array(Issue).annotations({
    description: "Every problem found, in the order they appear in the text",
  }),
});
export type GrammarReport = typeof GrammarReport.Type;

/** Most characters checked at once. */
export const maxTextLength = 20_000;

/** Where the issue's excerpt first appears in the text, or null if it isn't there now. */
export const excerptRange = (
  text: string,
  issue: Issue,
): { readonly start: number; readonly end: number } | null => {
  const start = text.indexOf(issue.excerpt);
  return issue.excerpt === "" || start === -1 ? null : { start, end: start + issue.excerpt.length };
};

/** The text with the issue's suggestion in place of its excerpt, or null if it isn't there now. */
export const applySuggestion = (text: string, issue: Issue): string | null => {
  const range = excerptRange(text, issue);
  return range === null
    ? null
    : text.slice(0, range.start) + issue.suggestion + text.slice(range.end);
};

/** Each kind of issue, as the widget labels it. */
export const kindLabels: Readonly<Record<IssueKind, string>> = {
  grammar: "Grammar",
  spelling: "Spelling",
  punctuation: "Punctuation",
  wording: "Wording",
  clarity: "Clarity",
  readability: "Readability",
};

/** A run's cost, e.g. "$0.012". */
export const formatCost = (usd: number): string =>
  usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
