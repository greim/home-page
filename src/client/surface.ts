/**
 * Visual settings for the surface the columns float over. Tweak these freely;
 * everything else is derived from them. (The background image, color and image
 * opacity are edited in admin mode and saved with the layout.)
 */
export const surface = {
  /** Space around and between columns, through which the texture shows. Any CSS length. */
  gap: "28px",
  /**
   * Shape of the rounded column corners (CSS `corner-shape`). "squircle" blends the
   * straight edges smoothly into the curve. Browsers without support fall back to round.
   */
  cornerShape: "squircle",
  /** Left/right padding inside each column. Any CSS length. */
  columnPaddingX: "27px",
  /** Space above each column's heading (and the "Add column" button). */
  columnPaddingTop: "23px",
  /** Space below the last item in each column. */
  columnPaddingBottom: "31px",
  /** Drop shadow each column casts onto the surface. */
  columnShadow: "0 14px 36px rgba(0, 0, 0, 0.6), 0 3px 8px rgba(0, 0, 0, 0.45)",
  /** Size of the icon left of each column heading. Any CSS length. */
  columnIconSize: "1.75rem",
  /** Size of each column thumbnail in the navigator (shown when columns overflow the view). */
  thumbWidth: "96px",
  thumbHeight: "56px",
  /** Drop shadow each navigator thumbnail casts. */
  thumbShadow: "0 6px 14px rgba(0, 0, 0, 0.55), 0 2px 4px rgba(0, 0, 0, 0.4)",
  /** Thickness of the white outline around the thumbnails of the columns in view. */
  thumbOutlineWidth: "2px",
  /** Height of the admin bar along the top of the viewport in admin mode. */
  adminBarHeight: "40px",
  /** Duration and easing of the admin bar sliding in/out and the columns making room for it. */
  adminTransition: "300ms ease",
  /** Width of the admin assistant's chat panel. */
  assistantPanelWidth: "400px",
} as const;

/** Text style for column headings (also used while renaming one in admin mode). */
export const columnHeading = {
  fontSize: "2rem",
  lineHeight: "2.5rem",
  /**
   * The column's own text color at 40% opacity, so it adapts to light and dark
   * columns and picks up a hint of tinted ones. (Black at 40% on white is #999.)
   */
  color: "fg/40",
} as const;

/** Rounded corners for columns (and anything shaped like one), with a radius of one gap. */
export const columnCorners = {
  borderRadius: surface.gap,
  cornerShape: surface.cornerShape,
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
