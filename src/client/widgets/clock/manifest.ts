import { Schema } from "effect";
import { defineManifest } from "../../../common/widgets.ts";

export const ClockConfig = Schema.Struct({
  /** An IANA time zone, e.g. "Europe/London". Null shows the computer's own. */
  timeZone: Schema.NullOr(Schema.String),
});
export type ClockConfig = typeof ClockConfig.Type;

export const manifest = defineManifest({
  title: "Clock",
  description: "Shows the current time and date, in the computer's time zone or a chosen one.",
  config: ClockConfig,
});
