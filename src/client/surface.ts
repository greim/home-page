import { type ColumnColor, columnColorCss } from "../common/column-color.ts";

/**
 * The root font size, which every rem on the page is relative to. Tying it to
 * the viewport's width scales the whole page with the window, so text never
 * re-wraps as it resizes. At 1vw, 1rem is 16px (the browser default) in a
 * window 1600px wide. Everything else must be sized in rem (or em) to scale.
 */
export const rootFontSize = "1vw";

/** Line height of all text on the page, as a multiple of the font size. */
export const textSpacing = 1.6;

/** Line height of code (e.g. snippets): tighter than text. */
export const codeTextSpacing = 1.2;

/** Corner radius of the bottom of each column; their tops sit flush with the window's. */
const cornerRadius = "0.5rem";

/** Corner radius of smaller things shaped like columns (e.g. navigator thumbnails). */
const smallCornerRadius = "0.25rem";

/**
 * The page's look; only column colors are the user's to choose (see
 * src/common/column-color.ts).
 */
export const surface = {
  /**
   * The surface the columns sit on. A CSS variable set at the surface's root
   * (see surfaceColors), so night mode can change it.
   */
  bg: "var(--surface-bg)",
  /**
   * Marks drawn directly on the surface, such as the add-column outline and the
   * navigator's markers: mid-gray, readable on the surface by day or night.
   */
  ink: "var(--surface-ink)",
  /** Space around and between columns. */
  gap: "1rem",
  cornerRadius,
  /** Left/right padding inside each column. */
  columnPaddingX: "1.3rem",
  /** Space above a column's heading (and the "Add column" button). */
  columnPaddingTop: "0.9rem",
  /** Space below a column's heading. */
  columnHeadingPaddingBottom: "0.8rem",
  /** Space below the last item in each column. */
  columnPaddingBottom: "2rem",
  /** Drop shadow each column casts onto the surface. */
  columnShadow: "0.2rem 0.2rem 0.6rem rgba(0, 0, 0, 0.5)",
  /** Lifts columns' white text off their color: a dark edge up and to the left. */
  columnTextShadow: "-1px -1px 0 rgba(0, 0, 0, 0.5)",
  /** A dark hairline inside each column's top and left edges. */
  columnInsetShadow: "-1px -1px 0 rgba(0, 0, 0, 0.25) inset",
  /** Size of the icon left of each column heading. */
  columnIconSize: "1.5rem",
  /** Size of each column thumbnail in the navigator (shown when columns overflow the view). */
  thumbWidth: "6rem",
  thumbHeight: "3.5rem",
  /** Drop shadow each navigator thumbnail casts: the column shadow, scaled down. */
  thumbShadow: "0.08rem 0.08rem 0.24rem rgba(0, 0, 0, 0.5)",
  /** Thickness of the outline around the thumbnails of the columns in view. */
  thumbOutlineWidth: "2px",
  /** Height of the admin bar along the top of the viewport in admin mode. */
  adminBarHeight: "2.5rem",
  /** Duration and easing of the admin bar sliding in/out and the columns making room for it. */
  adminTransition: "300ms ease",
} as const;

/** The CSS variables behind `surface.bg` and `surface.ink`, set at the surface's root. */
export const surfaceColors = (night: boolean) => ({
  "--surface-bg": night ? "#333333" : "#ffffff",
  "--surface-ink": "#999999",
});

/**
 * Night mode: between the end of the user's day and the start of the next, the
 * page dims and stars come out.
 */
export const night = {
  /** How long the page takes to change between day and night, as the day ends or begins. */
  transition: "20s linear",
  /** The same change when the user makes it, previewing daytime in admin mode. */
  quickTransition: "0.4s ease",
  /** Every column's color at night: the same gray, whatever its color by day. */
  columnColor: "#4a4a4a",
  /** How opaque the starfield gets: never fully, so it never gets in the way. */
  starfieldOpacity: 0.25,
  /** How long each star takes to fade in, once its delay is up. */
  starFadeSeconds: 30,
  /** Stars' delays are spread at random over this many seconds. */
  starDelayWindowSeconds: 30,
} as const;

/**
 * Everything on the page is monospace. Chakra's fonts are CSS variables, so
 * pointing them at monospace restyles every use of them, in the shell and in
 * widgets alike. Dialogs and menus render outside the surface, so keep Chakra's
 * own fonts.
 */
const monospaceFonts = {
  "--chakra-fonts-body": "monospace",
  "--chakra-fonts-heading": "monospace",
  "--chakra-fonts-mono": "monospace",
} as const;

/** Typography for the surface's root: inherited by everything on it. */
export const pageTypography = {
  lineHeight: String(textSpacing),
  fontFamily: "monospace",
  ...monospaceFonts,
  // Chakra's Theme (used by columns) declares all of Chakra's tokens afresh.
  "& .chakra-theme": monospaceFonts,
} as const;

/** Text style for column headings (also used while renaming one in admin mode). */
export const columnHeading = {
  fontSize: "1.5rem",
  lineHeight: String(textSpacing),
  fontFamily: "heading",
  fontWeight: "normal",
  color: "fg",
} as const;

/** Height of a column heading's line: its font size times the line height. */
export const columnHeadingHeight = `calc(1.5rem * ${textSpacing})`;

/**
 * A column heading's band: a sheen from light at the top to dark at the bottom,
 * over the column's color, with an edge below it that catches the light.
 */
export const columnHeadingBand = {
  bgImage: "linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(0, 0, 0, 0.1) 100%)",
  borderBottom: "1px solid rgba(0, 0, 0, 0.5)",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.25), 0 0 2rem rgba(255, 255, 255, 0.15)",
} as const;

/**
 * Each widget in a column: a section, divided from the one above it by a groove
 * (a light line over a dark one) that runs the column's full width. The first
 * sits right below the column heading, which has its own edge.
 */
export const widgetSection = {
  mx: `calc(-1 * ${surface.columnPaddingX})`,
  px: surface.columnPaddingX,
  mt: "1rem",
  pt: "1rem",
  borderTop: "1px solid rgba(255, 255, 255, 0.25)",
  boxShadow: "0 -1px 0 rgba(0, 0, 0, 0.3)",
  _first: { mt: "0", pt: "0", borderTop: "none", boxShadow: "none" },
} as const;

/** Text style for a widget's own heading (e.g. bookmarks'), for widgets that have one. */
export const widgetHeading = {
  display: "block",
  fontSize: "1.17rem",
  lineHeight: String(textSpacing),
  fontFamily: "heading",
  fontWeight: "normal",
  color: "fg",
  mb: "1rem",
} as const;

/**
 * Hides a scroll container's scrollbar; it still scrolls by wheel, trackpad,
 * touch and keyboard. The pseudo-element covers Safari before 18.2.
 */
export const hiddenScrollbar = {
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
} as const;

/**
 * Column corners. Columns normally hang from the top of the window, so their
 * top corners are square and only the bottom ones are rounded. In admin mode
 * they're detached from it, below the admin bar, so all four are rounded. The
 * change animates along with the columns making room for the admin bar.
 */
export const columnCorners = (detached: boolean) => ({
  borderTopRadius: detached ? cornerRadius : "0",
  borderBottomRadius: cornerRadius,
});

/** How column corners round off and square up as columns detach from the window's top. */
export const columnCornersTransition = `border-radius ${surface.adminTransition}`;

/** Rounded corners for smaller things shaped like columns. */
export const smallCorners = { borderRadius: smallCornerRadius } as const;

/**
 * Fine diagonal hatching, over the dark wells set into columns (code boxes, the
 * workday bar), tiled at its native size, not scaled with the page.
 */
export const hatching = {
  bgImage:
    "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAQElEQVR42mJgYGCI/P//vyYQM2DDzEDiL1DRdQYsgJGRMZIRpAqXJFDuAlZjka3FK4mhAJuD8UrCFeDzKkCAAQDTS4zmEvR9swAAAABJRU5ErkJggg==)",
  bgRepeat: "repeat",
  bgSize: "8px 8px",
} as const;

/**
 * A box of source code (e.g. a snippet): a dark wash, with tighter lines than
 * text, sunk into the column by a dark edge above and left and a light one
 * below and right.
 */
export const codeBox = {
  bgColor: "rgba(69, 69, 69, 0.5)",
  ...hatching,
  lineHeight: String(codeTextSpacing),
  borderRadius: "0.25em",
  boxShadow:
    "-1px -1px 0 rgba(0, 0, 0, 0.7), 1px 1px 0 rgba(255, 255, 255, 0.25), 0.1em 0.1em 0.2em rgba(0, 0, 0, 0.15) inset",
} as const;

/** A column's background: its own color by day, and the night gray at night. */
export const columnBackground = (color: ColumnColor, isNight: boolean): string =>
  isNight ? night.columnColor : columnColorCss(color);

/** How a column's background changes between day and night, at the given pace. */
export const columnBackgroundTransition = (pace: string) => `background-color ${pace}`;
