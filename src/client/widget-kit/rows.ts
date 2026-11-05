/** List editing helpers for widget editors. */
import { moveWhere } from "../../common/arrays.ts";

/** Moves the item with `id` one position up (-1) or down (+1). */
export const nudge = <T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  id: string,
  delta: -1 | 1,
): ReadonlyArray<T> => {
  const index = items.findIndex((item) => item.id === id);
  return index === -1 ? items : moveWhere(items, (item) => item.id === id, index + delta);
};
