/**
 * Pure helpers for column heading icons, which are addressed by react-icons
 * export name (e.g. "LuStar"). The icon set itself lives in icon-set.ts.
 */
import { defaultColumnIcon } from "../common/model.ts";

export type IconEntry = {
  readonly name: string;
  /** Lowercase words for display and search, e.g. "arrow big down" for LuArrowBigDown. */
  readonly label: string;
};

/** "LuArrowBigDown" → "arrow big down"; "LuColumns3" → "columns 3". */
export const iconLabel = (name: string): string =>
  name
    .replace(/^Lu/, "")
    .replace(/([a-z0-9])(?=[A-Z])|([a-z])(?=[0-9])/g, "$1$2 ")
    .toLowerCase();

const toEntry = (name: string): IconEntry => ({ name, label: iconLabel(name) });

/** Entries for the given names, sorted by label. */
export const iconEntries = (names: ReadonlyArray<string>): ReadonlyArray<IconEntry> =>
  names.map(toEntry).toSorted((a, b) => a.label.localeCompare(b.label));

/**
 * Entries whose label contains every word of `query`. Labels starting with the
 * query come first; otherwise the input order is kept. An empty query matches all.
 */
export const searchIcons = (
  entries: ReadonlyArray<IconEntry>,
  query: string,
): ReadonlyArray<IconEntry> => {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  const terms = q.split(" ").filter((t) => t !== "");
  const matches = entries.filter((e) => terms.every((t) => e.label.includes(t)));
  const leading = (e: IconEntry) => (e.label.startsWith(q) ? 0 : 1);
  return matches.toSorted((a, b) => leading(a) - leading(b));
};

/** Picks a name using `random` (a number in [0, 1), like Math.random). */
export const pickIcon = (names: ReadonlyArray<string>, random: number): string =>
  names.at(Math.floor(random * names.length)) ?? defaultColumnIcon;
