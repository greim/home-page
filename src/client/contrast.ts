/** Picks light or dark UI for content drawn on a given background color. */

const channel = (hex: string, offset: number): number => {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a `#rrggbb` color, from 0 (black) to 1 (white). */
export const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/**
 * "dark" when light text contrasts better with the background than dark text
 * does, otherwise "light". Matches Chakra's `Theme appearance` values.
 */
export const appearanceFor = (hex: string): "light" | "dark" => {
  const l = luminance(hex);
  const againstWhite = 1.05 / (l + 0.05);
  const againstBlack = (l + 0.05) / 0.05;
  return againstWhite > againstBlack ? "dark" : "light";
};
