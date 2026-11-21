/**
 * Where a bookmarks widget keeps what's open: in this browser's localStorage, and in memory, shared
 * by every view in this bundle. If the browser won't keep it, it lasts until the page reloads.
 */
import { useSyncExternalStore } from "react";
import { type OpenState, openStateText, readOpenState } from "./open-state.ts";

const key = (widgetId: string) => `bookmarks:${widgetId}:open`;

const states = new Map<string, OpenState>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const stateOf = (widgetId: string): OpenState => {
  const known = states.get(widgetId);
  if (known !== undefined) return known;
  let text: string | null = null;
  try {
    text = localStorage.getItem(key(widgetId));
  } catch {
    // Not kept: it lasts until the page reloads.
  }
  const read = readOpenState(text);
  states.set(widgetId, read);
  return read;
};

/** Changes a widget's open state with `change`, e.g. `toggleFolder`, and keeps the result. */
export const changeOpenState = (
  widgetId: string,
  change: (state: OpenState) => OpenState,
): void => {
  const next = change(stateOf(widgetId));
  states.set(widgetId, next);
  try {
    localStorage.setItem(key(widgetId), openStateText(next));
  } catch {
    // Not kept: it lasts until the page reloads.
  }
  for (const listener of listeners) listener();
};

export const useOpenState = (widgetId: string): OpenState =>
  useSyncExternalStore(subscribe, () => stateOf(widgetId));
