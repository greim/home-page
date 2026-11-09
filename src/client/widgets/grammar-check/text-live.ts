/**
 * The text being checked, shared by a grammar check widget's card and its
 * full-screen view, so text pasted into the card is there when the view opens, and
 * fixes applied there show in the card. Both views run in this bundle, so this is
 * just memory: kept per widget until the page reloads, never saved or sent anywhere.
 */
import { useSyncExternalStore } from "react";

const texts = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** A widget's text, and a setter; the component re-renders when it changes. */
export const useText = (widgetId: string): readonly [string, (text: string) => void] => {
  const text = useSyncExternalStore(subscribe, () => texts.get(widgetId) ?? "");
  const setText = (next: string) => {
    texts.set(widgetId, next);
    for (const listener of listeners) listener();
  };
  return [text, setText];
};
