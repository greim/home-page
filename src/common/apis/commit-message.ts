/**
 * The commit message API, on the assistant service (which has Claude): a short description of a
 * change to the layout, written by a small model from the change's diff, for the page to accept the
 * change with (see src/server/commit-message.ts).
 *
 * The diff goes to Anthropic, like everything the assistant sees. It's only of the layout file,
 * which holds settings, not what widgets fetch or hold.
 */
import { Schema } from "effect";
import { apiError, defineApi, operation } from "../widget-apis.ts";

/** There's nothing to describe, or the model gave nothing usable. */
export const NoSuggestion = apiError("no-suggestion");

export const commitMessageApi = defineApi("commit-message", "assistant", {
  /** One line saying what `diff` (a unified diff of the layout file) changes. */
  suggest: operation({
    input: Schema.Struct({ diff: Schema.String }),
    output: Schema.Struct({ message: Schema.String }),
    errors: NoSuggestion,
  }),
}, { services: [] });

export type CommitMessageApi = typeof commitMessageApi;
