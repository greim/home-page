/** The paste-as-Markdown widget's config: just its heading. */
import { Schema } from "effect";

export const PasteMarkdownConfig = Schema.Struct({
  /** Shown above the box. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type PasteMarkdownConfig = typeof PasteMarkdownConfig.Type;
