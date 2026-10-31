/** Immutable array helpers. Out-of-range indexes are clamped, never thrown. */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

export const insertAt = <T>(
  items: ReadonlyArray<T>,
  index: number,
  item: T,
): ReadonlyArray<T> => {
  const at = clamp(index, 0, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
};

/** Moves the first item matching `pred` to `toIndex` (in the result array). */
export const moveWhere = <T>(
  items: ReadonlyArray<T>,
  pred: (item: T) => boolean,
  toIndex: number,
): ReadonlyArray<T> => {
  const from = items.findIndex(pred);
  const item = items.at(from);
  if (from === -1 || item === undefined) {
    return items;
  }
  const without = items.filter((_, i) => i !== from);
  return insertAt(without, toIndex, item);
};

export const mapWhere = <T>(
  items: ReadonlyArray<T>,
  pred: (item: T) => boolean,
  fn: (item: T) => T,
): ReadonlyArray<T> => items.map((item) => (pred(item) ? fn(item) : item));

export const removeWhere = <T>(
  items: ReadonlyArray<T>,
  pred: (item: T) => boolean,
): ReadonlyArray<T> => items.filter((item) => !pred(item));
