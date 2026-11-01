const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Splits text into lines of user-perceived characters, so that clicking an
 * emoji or a combined character copies the whole thing, not half a surrogate
 * pair.
 */
export const graphemeLines = (
  text: string,
): ReadonlyArray<ReadonlyArray<string>> =>
  text.split("\n").map((line) => Array.from(segmenter.segment(line), (s) => s.segment));

/**
 * Whether a character in a copyable-characters snippet can be copied: anything
 * but whitespace, which is only there to lay the characters out.
 */
export const isCopyableChar = (char: string): boolean => char.trim() !== "";
