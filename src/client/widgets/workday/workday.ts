/** The workday widget's logic: what its bar says, and where its percentage sits. */
import type { Workday } from "../../../common/day-cycle.ts";

/** The heading for each part of the week. */
export const workdayTitle = (is: Workday["is"]): string => {
  switch (is) {
    case "workday":
      return "Workday";
    case "after-hours":
      return "After Hours";
    case "weekend":
      return "Weekend";
    default:
      return is satisfies never;
  }
};

/** How far through it is, as a whole percentage. Rounded down: 100% only once it's over. */
export const percent = (progress: number): number =>
  Math.min(100, Math.max(0, Math.floor(progress * 100)));

/** Lengths along the bar, all in the same unit (e.g. pixels). */
export type LabelLayout = {
  /** How far through the bar is filled, from 0 to 1. */
  readonly progress: number;
  /** The bar's width. */
  readonly track: number;
  /** The percentage label's width. */
  readonly label: number;
  /** The label's usual distance from the bar's right end. */
  readonly inset: number;
  /** The least space to keep between the label and the fill's edge. */
  readonly gap: number;
};

/**
 * Where the percentage label goes, as the distance from the bar's right end to
 * the label's right edge. It sits at the right end of the bar, past the fill;
 * once the fill reaches it, it moves inside the fill, just left of its edge. So
 * it never covers the edge.
 */
export const labelRight = (m: LabelLayout): number => {
  const edge = Math.min(1, Math.max(0, m.progress)) * m.track;
  const labelLeft = m.track - m.inset - m.label;
  return edge < labelLeft - m.gap ? m.inset : Math.max(m.inset, m.track - edge + m.gap);
};
