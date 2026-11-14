import { useSyncExternalStore } from "react";
import { largerRegimes, regimeQuery } from "./regimes.ts";

/** One media query per regime above one column: the same ones the root font size uses. */
const queries = largerRegimes.map((columns) => globalThis.matchMedia(regimeQuery(columns)));

const subscribe = (onChange: () => void): () => void => {
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
};

/** The regimes are nested, so the columns shown are one more than the queries matching. */
const snapshot = (): number => 1 + queries.filter((query) => query.matches).length;

/**
 * How many columns the window's current layout regime shows; changes as the window resizes
 * (or zooms). It reads the same media queries that set the root font size (see regimes.ts).
 */
export const useColumnsPerView = (): number => useSyncExternalStore(subscribe, snapshot);
