/** The clock widget's config. */
import { Schema } from "effect";

export const ClockConfig = Schema.Struct({
  /** An IANA time zone, e.g. "Europe/London". Null shows the computer's own. */
  timeZone: Schema.NullOr(Schema.String),
});
export type ClockConfig = typeof ClockConfig.Type;
