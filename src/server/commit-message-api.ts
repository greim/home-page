/** Serves the commit message widget API (src/common/apis/commit-message.ts) on the assistant service. */
import { Effect } from "effect";
import { commitMessageApi } from "../common/apis/commit-message.ts";
import { CommitMessageIo, suggest } from "./commit-message.ts";
import { serve, type ServedApi } from "./widget-api-routes.ts";

export const commitMessageServed: ServedApi<CommitMessageIo> = serve<
  typeof commitMessageApi,
  CommitMessageIo
>(commitMessageApi, {
  suggest: ({ diff }) =>
    suggest(diff).pipe(
      Effect.map((message) => ({ ok: true, value: { message } }) as const),
      Effect.catchTag(
        "NoSuggestion",
        (e) =>
          Effect.succeed(
            { ok: false, error: { is: "no-suggestion", message: e.message } } as const,
          ),
      ),
    ),
});
