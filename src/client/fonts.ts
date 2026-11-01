/** Turns the skin's fonts into CSS, and works out which Google fonts to load. */
import type { Font, Skin } from "../common/model.ts";

/** CSS font-family list for a font: its name (quoted), then its fallback. */
export const fontStack = (font: Font): string =>
  font.name === null ? font.fallback : `"${font.name}", ${font.fallback}`;

/** Every weight a skin can ask for, upright and italic. Google leaves out those a font lacks. */
const allStyles = "ital,wght@" +
  [0, 1].flatMap((italic) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => `${italic},${w}00`)).join(";");

/**
 * The Google Fonts stylesheet for the skin's Google fonts, or null if it uses
 * none. The browser only downloads the font files the page actually uses.
 */
export const googleFontsUrl = (skin: Skin): string | null => {
  const names = [skin.headingFont, skin.bodyFont, skin.codeFont]
    .flatMap((font) => font.is === "google" ? [font.name] : []);
  const unique = [...new Set(names)];
  if (unique.length === 0) return null;
  const families = unique.map((name) => `family=${name.replaceAll(" ", "+")}:${allStyles}`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
};
