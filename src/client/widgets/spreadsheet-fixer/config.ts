/** The spreadsheet fixer's config: just a heading. The sheets it fixes aren't kept. */
import { Schema } from "effect";

export const SpreadsheetFixerConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type SpreadsheetFixerConfig = typeof SpreadsheetFixerConfig.Type;

/** What the agent answers with, once it's fixed the sheet. */
export const FixReport = Schema.Struct({
  summary: Schema.String.annotations({
    description: "What was wrong with the sheet and what you fixed, in two or three sentences",
  }),
  changes: Schema.Array(Schema.String).annotations({
    description: "Each change made, in plain words, as apply_changes reported it",
  }),
  left: Schema.Array(Schema.String).annotations({
    description: "Problems you saw but didn't fix, and why (e.g. needs a person to decide)",
  }),
  output: Schema.String.annotations({ description: "The fixed copy's file name in out/" }),
});
export type FixReport = typeof FixReport.Type;
