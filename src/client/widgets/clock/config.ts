/** The clock widget's config: it has no settings. */
import { Schema } from "effect";

/** Configs saved when the clock had a time zone setting decode as this too (it's ignored). */
export const ClockConfig = Schema.Struct({});
export type ClockConfig = typeof ClockConfig.Type;
