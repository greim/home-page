/**
 * The web researcher's past research: each finished report with the topic it was for.
 * Pure functions on the list; where it's kept is history-live.ts.
 */
import { Either, Schema } from "effect";
import { ResearchReport } from "./config.ts";

export const PastResearch = Schema.Struct({
  id: Schema.String,
  topic: Schema.String,
  /** When it finished, in ms since the epoch. */
  createdAt: Schema.Number,
  report: ResearchReport,
});
export type PastResearch = typeof PastResearch.Type;

/** The most past researches kept per widget: the oldest go first. */
export const maxKept = 50;

const Stored = Schema.Array(PastResearch);

/** The kept list from its saved text; empty if there's none or it can't be read. */
export const readHistory = (text: string | null): ReadonlyArray<PastResearch> => {
  if (text === null) return [];
  const decoded = Schema.decodeUnknownEither(Schema.parseJson(Stored))(text);
  return Either.isRight(decoded) ? decoded.right : [];
};

export const historyText = (history: ReadonlyArray<PastResearch>): string =>
  JSON.stringify(history);

/** `history` with `added` newest-first on top, capped at `maxKept`; one with its ID is replaced. */
export const withResearch = (
  history: ReadonlyArray<PastResearch>,
  added: PastResearch,
): ReadonlyArray<PastResearch> =>
  [added, ...history.filter((h) => h.id !== added.id)]
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxKept);

export const withoutResearch = (
  history: ReadonlyArray<PastResearch>,
  id: string,
): ReadonlyArray<PastResearch> => history.filter((h) => h.id !== id);
