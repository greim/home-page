/** The snippets widget's config: text to copy, each piece with a label. */
import { Schema } from "effect";

/** Copy the whole snippet when it's clicked, or just the character clicked. */
export const SnippetCopy = Schema.Literal("whole", "char");
export type SnippetCopy = typeof SnippetCopy.Type;

export const Snippet = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  text: Schema.String,
  copy: SnippetCopy,
});
export type Snippet = typeof Snippet.Type;

export const SnippetsConfig = Schema.Struct({
  /** Shown above the snippets. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
  snippets: Schema.Array(Snippet),
});
export type SnippetsConfig = typeof SnippetsConfig.Type;
