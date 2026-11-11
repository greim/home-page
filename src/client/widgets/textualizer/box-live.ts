/**
 * What a textualizer's card and its full-screen view share: what the box shows,
 * and the source in it, so a fix made in the full-screen view shows in the card,
 * and Clear in the card empties the view. Both run in this bundle, so this is just
 * memory: kept per widget until the page reloads, never saved or sent anywhere.
 */
import { useSyncExternalStore } from "react";
import type { Source } from "./source.ts";

/** What the box is showing. */
export type Box =
  | { readonly is: "empty" }
  | { readonly is: "error"; readonly message: string }
  | { readonly is: "question"; readonly text: string }
  | { readonly is: "preview"; readonly source: Source };

const empty: Box = { is: "empty" };
const boxes = new Map<string, Box>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** A widget's box, and a setter; the component re-renders when it changes. */
export const useBox = (widgetId: string): readonly [Box, (box: Box) => void] => {
  const box = useSyncExternalStore(subscribe, () => boxes.get(widgetId) ?? empty);
  const setBox = (next: Box) => {
    boxes.set(widgetId, next);
    for (const listener of listeners) listener();
  };
  return [box, setBox];
};
