import type { SystemStyleObject } from "@chakra-ui/react";

/**
 * Adaptable viewport-relative design: layout regimes. Each regime is a range of
 * viewport widths showing a whole number of columns. Within one, 1rem is a fixed
 * fraction of the viewport's width (classic viewport-relative design), so the
 * layout scales proportionally; crossing into the next regime changes the column
 * count and the size of 1rem.
 */

/** Width of a column, and of the gap between (and around) columns, in rem. */
export const columnRem = 24;
export const gapRem = 1;

/** The size of 1rem, in px, in the middle of a regime: columns are 480px, gaps 20px. */
export const optimalRemPx = 20;

/** Regimes beyond this many columns aren't distinguished: the last one just keeps growing. */
export const maxColumns = 12;

/** The width of the page in rem with `columns` columns: each column, and a gap on both sides of it. */
export const pageRem = (columns: number): number => columns * (columnRem + gapRem) + gapRem;

/** The viewport width, in px, at which `columns` columns are at their optimal size. */
export const optimalWidth = (columns: number): number => optimalRemPx * pageRem(columns);

/**
 * The viewport width at which the layout changes from `columns` to `columns + 1`:
 * midway between their optimal widths, so each is as far from its optimum going up
 * as the next one is going down.
 */
export const upperBoundary = (columns: number): number =>
  (optimalWidth(columns) + optimalWidth(columns + 1)) / 2;

/**
 * The media query that matches while the viewport is wide enough for at least `columns`
 * columns (for 2 or more). The CSS root font size and the JS column count both go by
 * these same queries, so they can never disagree about which regime the page is in.
 */
export const regimeQuery = (columns: number): string =>
  `(min-width: ${upperBoundary(columns - 1)}px)`;

/** The regimes above one column, in order: those whose queries to check for the column count. */
export const largerRegimes: ReadonlyArray<number> = Array.from(
  { length: maxColumns - 1 },
  (_, i) => i + 2,
);

/** The root font size (CSS) for `columns` columns: the viewport's width split into the page's rems. */
export const rootFontSizeFor = (columns: number): string => `calc(100vw / ${pageRem(columns)})`;

/**
 * The root font size as Chakra global CSS: the one-column size by default,
 * overridden by a media query for each regime above it.
 */
export const regimeRootFontSizes = (): SystemStyleObject => ({
  fontSize: rootFontSizeFor(1),
  ...Object.fromEntries(
    largerRegimes.map((columns) => [
      `@media ${regimeQuery(columns)}`,
      { fontSize: rootFontSizeFor(columns) },
    ]),
  ),
});
