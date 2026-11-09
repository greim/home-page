/**
 * What a grammar check widget's card and its full-screen view share: the text, so
 * text pasted into the card is there when the view opens, and fixes applied there
 * show in the card; and the card's request to check it at once. Both views run in
 * this bundle, so this is just memory: kept per widget until the page reloads, never
 * saved or sent anywhere.
 */
import { useEffect, useSyncExternalStore } from "react";

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

/** Widgets whose card asked for a check, not yet started by their full-screen view. */
const requested = new Set<string>();

/** Asks a widget's full-screen view to check its text as soon as it's showing. */
export const requestCheck = (widgetId: string): void => {
  requested.add(widgetId);
  for (const listener of listeners) listener();
};

/**
 * Calls `onRequest` once for each check the card asks for: when the view opens on
 * one, or, if it's already open (torn off), when it's asked.
 */
export const useCheckRequests = (widgetId: string, onRequest: () => void): void => {
  const pending = useSyncExternalStore(subscribe, () => requested.has(widgetId));
  useEffect(() => {
    if (pending && requested.delete(widgetId)) onRequest();
  }, [pending, widgetId]);
};
