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

export const clampOffset = (offset: number, slotCount: number): number =>
  Math.max(0, Math.min(offset, slotCount - columnsPerView));

export type Carousel = {
  readonly offset: number;
  readonly canSlideLeft: boolean;
  readonly canSlideRight: boolean;
};

export const carousel = (offset: number, slotCount: number): Carousel => {
  const clamped = clampOffset(offset, slotCount);
  return {
    offset: clamped,
    canSlideLeft: clamped > 0,
    canSlideRight: clamped + columnsPerView < slotCount,
  };
};
