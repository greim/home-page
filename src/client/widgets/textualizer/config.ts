/** The textualizer widget's config: just a heading. What's pasted into it isn't kept. */
import { Schema } from "effect";

export const TextualizerConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type TextualizerConfig = typeof TextualizerConfig.Type;
