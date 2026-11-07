/** The workday widget's config: it has no settings. It follows the user's schedule. */
import { Schema } from "effect";

export const WorkdayConfig = Schema.Struct({});
export type WorkdayConfig = typeof WorkdayConfig.Type;
