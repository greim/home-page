/**
 * What the page configurator's card hands its full-screen view: what the user typed
 * in the column, for the view to send as soon as it's showing (or, if it's already
 * open in its own window, when it's asked). Both views run in this bundle, so this is
 * just memory, never saved or sent anywhere but to the widget's agent.
 */
import { useEffect, useSyncExternalStore } from "react";

const requests = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Asks a widget's full-screen view to send `message`. A later request replaces one not yet taken. */
export const requestChange = (widgetId: string, message: string): void => {
  requests.set(widgetId, message);
  for (const listener of listeners) listener();
};

/** A widget's waiting request, taken (so it's handled once); null if there's none. */
export const takeRequest = (widgetId: string): string | null => {
  const message = requests.get(widgetId) ?? null;
  requests.delete(widgetId);
  return message;
};

/** Calls `onRequest` once with each request the card makes, while the view is showing. */
export const useChangeRequests = (
  widgetId: string,
  onRequest: (message: string) => void,
): void => {
  const waiting = useSyncExternalStore(subscribe, () => requests.get(widgetId) ?? null);
  useEffect(() => {
    if (waiting === null) return;
    const message = takeRequest(widgetId);
    if (message !== null) onRequest(message);
  }, [waiting, widgetId]);
};
