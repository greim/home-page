/** The grammar check widget's config: just a heading. The text it checks isn't kept. */
import { Schema } from "effect";

export const GrammarCheckConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type GrammarCheckConfig = typeof GrammarCheckConfig.Type;
