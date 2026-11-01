/** Pure layout math for the horizontally sliding column strip. */
import type { Column } from "../common/model.ts";

export const columnsPerView = 4;

/** A slot in the strip: a real column, or the "add a column" placeholder. */
export type Slot =
  | { is: "column"; column: Column; index: number }
  | { is: "add-column"; index: number };

/**
 * Hidden columns are skipped outside admin mode. The add-column placeholder
 * appears when columns don't fill the view, and always in admin mode.
 * `index` is the position in the full column list, for inserting/moving.
 */
export const stripSlots = (
  columns: ReadonlyArray<Column>,
  admin: boolean,
): ReadonlyArray<Slot> => {
  const shown: ReadonlyArray<Slot> = columns.flatMap((column, index) =>
    admin || !column.hidden ? [{ is: "column" as const, column, index }] : []
  );
  const needsPlaceholder = admin || shown.length < columnsPerView;
  return needsPlaceholder ? [...shown, { is: "add-column", index: columns.length }] : shown;
};

/**
 * Keeps the view within bounds, and filled with as many columns as possible: it
 * stops at the last column, so the add-column slot after it only shows when
 * there aren't enough columns to fill the view.
 */
export const clampOffset = (offset: number, columnCount: number): number =>
  Math.max(0, Math.min(offset, columnCount - columnsPerView));

export type Carousel = {
  readonly offset: number;
  /** More slots than fit in the view, so the column navigator is shown. */
  readonly navigable: boolean;
};

export const carousel = (offset: number, slots: ReadonlyArray<Slot>): Carousel => ({
  offset: clampOffset(offset, slots.filter((slot) => slot.is === "column").length),
  navigable: slots.length > columnsPerView,
});

/** Whether the slot at `index` is among those in view at `offset`. */
export const inView = (offset: number, index: number): boolean =>
  index >= offset && index < offset + columnsPerView;

/**
 * The offset that slides the slot at `index` just into view, on the side it was
 * hidden past. A slot already in view leaves the offset unchanged.
 */
export const revealOffset = (offset: number, index: number): number =>
  index < offset ? index : index >= offset + columnsPerView ? index - columnsPerView + 1 : offset;

/**
 * CSS height of the frame holding the columns: the viewport less the frame's
 * margins above and below, and less whatever else is shown (the admin bar, the
 * navigator).
 */
export const frameHeight = (
  margins: { top: string; bottom: string },
  others: ReadonlyArray<string>,
): string =>
  `calc(100% - ${margins.top} - ${margins.bottom}${others.map((h) => ` - ${h}`).join("")})`;
