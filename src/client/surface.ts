/**
 * The root font size, which every rem on the page is relative to. Tying it to
 * the viewport's width scales the whole page with the window, so text never
 * re-wraps as it resizes. At 1vw, 1rem is 16px (the browser default) in a
 * window 1600px wide. Everything else must be sized in rem (or em) to scale.
 */
export const rootFontSize = "1vw";

/**
 * Visual settings for the surface the columns float over. Those set by the skin
 * (see skin.ts, and Skin in model.ts) refer to the CSS variables it sets; the
 * rest are fixed. (The background is edited in admin mode and saved with the
 * layout.)
 */
export const surface = {
  /** Space around and between columns, through which the texture shows. Set by the skin. */
  gap: "var(--skin-gap)",
  /** Corner radius of columns, and anything shaped like one. Set by the skin. */
  cornerRadius: "var(--skin-corner-radius)",
  /**
   * Shape of the rounded column corners (CSS `corner-shape`). "squircle" blends the
   * straight edges smoothly into the curve. Browsers without support fall back to round.
   */
  cornerShape: "squircle",
  /** Left/right padding inside each column. Set by the skin. */
  columnPaddingX: "var(--skin-column-padding-x)",
  /** Space above each column's heading (and the "Add column" button). Set by the skin. */
  columnPaddingTop: "var(--skin-column-padding-top)",
  /** Space below the last item in each column. Set by the skin. */
  columnPaddingBottom: "var(--skin-column-padding-bottom)",
  /** Drop shadow each column casts onto the surface. Set by the skin. */
  columnShadow: "var(--skin-column-shadow)",
  /** Size of the icon left of each column heading. */
  columnIconSize: "1.75rem",
  /** Size of each column thumbnail in the navigator (shown when columns overflow the view). */
  thumbWidth: "6rem",
  thumbHeight: "3.5rem",
  /** Drop shadow each navigator thumbnail casts: the column shadow, scaled down. */
  thumbShadow: "var(--skin-thumb-shadow)",
  /** The code boxes' inset shadow, fainter, for subtle wells (the assistant widget). */
  faintInsetShadow: "var(--skin-faint-inset-shadow)",
  /** Thickness of the white outline around the thumbnails of the columns in view. */
  thumbOutlineWidth: "2px",
  /** Height of the admin bar along the top of the viewport in admin mode. */
  adminBarHeight: "2.5rem",
  /** Duration and easing of the admin bar sliding in/out and the columns making room for it. */
  adminTransition: "300ms ease",
  /** Width of the admin assistant's chat panel. */
  assistantPanelWidth: "25rem",
  /** Height of an assistant widget's chat, messages and input together. */
  assistantWidgetHeight: "26rem",
} as const;

/**
 * Typography the skin controls, applied at the surface's root: line height and
 * the body font are inherited, and Chakra's fonts are CSS variables, so pointing
 * those at the skin's fonts restyles every use of them.
 */
const skinFonts = {
  "--chakra-fonts-body": "var(--skin-body-font)",
  "--chakra-fonts-heading": "var(--skin-heading-font)",
  "--chakra-fonts-mono": "var(--skin-code-font)",
} as const;

export const skinTypography = {
  lineHeight: "var(--skin-text-spacing)",
  fontFamily: "var(--skin-body-font)",
  ...skinFonts,
  // Chakra's Theme (used by columns) declares all of Chakra's tokens afresh.
  "& .chakra-theme": skinFonts,
} as const;

/** `fg`, the text color (which adapts to light and dark columns), made translucent. */
const fadedFg = (alpha: string) =>
  `color-mix(in srgb, var(--chakra-colors-fg) ${alpha}, transparent)`;

/** Text style for column headings (also used while renaming one in admin mode). */
export const columnHeading = {
  fontSize: "2rem",
  lineHeight: "var(--skin-text-spacing)",
  fontFamily: "heading",
  fontWeight: "var(--skin-column-heading-weight)",
  /**
   * The column's own text color at the skin's opacity, so it adapts to light and
   * dark columns and picks up a hint of tinted ones.
   */
  color: fadedFg("var(--skin-column-heading-alpha)"),
} as const;

/** Height of a column heading's line: its font size times the line height. */
export const columnHeadingHeight = "calc(2rem * var(--skin-text-spacing))";

/** Text style for widget headings: like column headings, translucent so they adapt. */
export const widgetHeading = {
  fontWeight: "var(--skin-widget-heading-weight)",
  color: fadedFg("var(--skin-widget-heading-alpha)"),
} as const;

/**
 * Hides a scroll container's scrollbar; it still scrolls by wheel, trackpad,
 * touch and keyboard. The pseudo-element covers Safari before 18.2.
 */
export const hiddenScrollbar = {
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
} as const;

/** Rounded corners for columns (and anything shaped like one), with the skin's radius. */
export const columnCorners = {
  borderRadius: surface.cornerRadius,
  cornerShape: surface.cornerShape,
} as const;

/** Rounded corners for smaller things shaped like columns: half the column radius. */
export const smallCorners = {
  borderRadius: `calc(${surface.cornerRadius} / 2)`,
  cornerShape: surface.cornerShape,
} as const;

/**
 * A box of source code (e.g. a snippet): dark grey, with tighter lines than text,
 * rounded at a third of the column radius, and inset by a shadow derived from the
 * column shadow.
 */
export const codeBox = {
  bg: "gray.800",
  lineHeight: "var(--skin-code-text-spacing)",
  borderRadius: `calc(${surface.cornerRadius} / 3)`,
  cornerShape: surface.cornerShape,
  boxShadow: "var(--skin-inset-shadow)",
} as const;

/** Quick picks offered in the column color picker (any #rrggbb is allowed). */
export const columnColorPresets: ReadonlyArray<string> = [
  "#ffffff",
  "#f7f3ea",
  "#eef3fa",
  "#edf6ef",
  "#fbefef",
  "#f3effa",
  "#fdf6dd",
  "#2b2d33",
  "#1f2a3a",
];

/**
 * How far a widget heading's text sits from the widget's left edge: its 1em
 * expand/collapse chevron (headings are 1rem) plus the 0.25rem gap after it.
 * Widget content uses this to line its text up with the heading's.
 */
export const widgetTextIndent = "1.25rem";
