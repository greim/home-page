/** The RSS feed widget's config: which feed, and how many of its headlines to show. */
import { Schema } from "effect";

/** The most headlines it shows. */
export const maxCount = 50;

export const RssFeedConfig = Schema.Struct({
  /** The feed's own URL (RSS, Atom or JSON Feed), not its site's page. Blank until it's set. */
  feedUrl: Schema.optionalWith(Schema.String, { default: () => "" }),
  /** How many of its latest headlines to show. */
  count: Schema.optionalWith(Schema.Int.pipe(Schema.between(1, maxCount)), { default: () => 10 }),
});
export type RssFeedConfig = typeof RssFeedConfig.Type;
