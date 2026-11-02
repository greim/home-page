/** Pure layout math for the horizontally sliding column strip. */
import type { Column } from "../common/model.ts";

export const columnsPerView = 4;

/** A slot in the strip: a real column, or the "add a column" placeholder. */
export type Slot =
  | { is: "column"; column: Column; index: number }
  | { is: "add-column"; index: number };

/**
 * Hidden columns are skipped outside admin mode. The add-column placeholder
 * appears when columns don't fill the view. (In admin mode, the navigator offers
 * other ways to add columns.) `index` is the position in the full column list,
 * for inserting/moving.
 */
export const stripSlots = (
  columns: ReadonlyArray<Column>,
  admin: boolean,
): ReadonlyArray<Slot> => {
  const shown: ReadonlyArray<Slot> = columns.flatMap((column, index) =>
    admin || !column.hidden ? [{ is: "column" as const, column, index }] : []
  );
  const needsPlaceholder = shown.length < columnsPerView;
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

/** The id of the column at the left edge of the view, to remember across reloads. */
export const leadingColumnId = (offset: number, slots: ReadonlyArray<Slot>): string | null => {
  const slot = slots[offset];
  return slot?.is === "column" ? slot.column.id : null;
};

/**
 * The offset that puts the column with id `columnId` at the left edge of the
 * view (before clamping), or 0 if it isn't shown (removed, or hidden).
 */
export const offsetOfColumn = (columnId: string | null, slots: ReadonlyArray<Slot>): number =>
  Math.max(0, slots.findIndex((slot) => slot.is === "column" && slot.column.id === columnId));

/** Whether the navigator is shown: always in admin mode, otherwise when it's needed. */
export const showNavigator = (view: Carousel, admin: boolean): boolean => admin || view.navigable;

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

/** Where a navigator thumbnail sits relative to the outline around those in view. */
export type Side = "left" | "in" | "right";

export const sideOf = (offset: number, index: number): Side =>
  index < offset ? "left" : inView(offset, index) ? "in" : "right";

/** Thumbnails outside the outline are pushed this many outline-widths away from it. */
export const sideShift = (side: Side): -1 | 0 | 1 => {
  switch (side) {
    case "left":
      return -1;
    case "in":
      return 0;
    case "right":
      return 1;
    default:
      return side satisfies never;
  }
};

/** A place a dragged column can be dropped: before column `gap`, centered at `x`. */
export type DropTarget = { readonly gap: number; readonly x: number };

/** The gap of the drop target nearest `x`, or null if there are none. */
export const nearestGap = (targets: ReadonlyArray<DropTarget>, x: number): number | null =>
  targets.reduce<DropTarget | null>(
    (best, t) => best === null || Math.abs(t.x - x) < Math.abs(best.x - x) ? t : best,
    null,
  )?.gap ?? null;
