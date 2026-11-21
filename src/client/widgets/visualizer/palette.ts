/** The visualizer's chart colors, shared by its agent's renderer and its views. */

/**
 * The charts' colors: on a dark surface (the chart's own card), the same in light and
 * dark mode. The categorical order is fixed (never cycled), validated for color vision
 * deficiency against that surface.
 */
export const palette = {
  surface: "#1a1a19",
  text: "#f0efec",
  secondaryText: "#c3c2b7",
  axis: "rgba(240, 239, 236, 0.35)",
  grid: "rgba(240, 239, 236, 0.12)",
  categories: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
  sequential: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  diverging: ["#d95926", "#e9a07f", "#383835", "#7fb2ea", "#3987e5"],
} as const;
