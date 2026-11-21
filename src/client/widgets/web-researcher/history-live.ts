/**
 * Where the web researcher keeps its past research: in this browser's localStorage
 * (reports are small), and in memory, shared by every view in this bundle. If the
 * browser won't keep it, it lasts until the page reloads.
 */
import { useSyncExternalStore } from "react";
import {
  historyText,
  type PastResearch,
  readHistory,
  withoutResearch,
  withResearch,
} from "./history.ts";

const key = (widgetId: string) => `web-researcher:${widgetId}:history`;

const lists = new Map<string, ReadonlyArray<PastResearch>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const listOf = (widgetId: string): ReadonlyArray<PastResearch> => {
  const known = lists.get(widgetId);
  if (known !== undefined) return known;
  let text: string | null = null;
  try {
    text = localStorage.getItem(key(widgetId));
  } catch {
    // Not kept: it lasts until the page reloads.
  }
  const read = readHistory(text);
  lists.set(widgetId, read);
  return read;
};

const set = (widgetId: string, next: ReadonlyArray<PastResearch>): void => {
  lists.set(widgetId, next);
  try {
    localStorage.setItem(key(widgetId), historyText(next));
  } catch {
    // Not kept: it lasts until the page reloads.
  }
  for (const listener of listeners) listener();
};

export const addResearch = (widgetId: string, added: PastResearch): void =>
  set(widgetId, withResearch(listOf(widgetId), added));

export const deleteResearch = (widgetId: string, id: string): void =>
  set(widgetId, withoutResearch(listOf(widgetId), id));

/** A widget's past research, newest first. */
export const useHistory = (widgetId: string): ReadonlyArray<PastResearch> =>
  useSyncExternalStore(subscribe, () => listOf(widgetId));
