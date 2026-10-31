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
