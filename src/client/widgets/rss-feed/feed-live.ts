/**
 * Reading the feed through the feeds API, again every so often while it shows; and
 * handing the item clicked to the full-screen reader. Both views run in this bundle,
 * so the handoff is just memory, kept per widget until the page reloads.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type FeedItem, feedsApi } from "../../../common/apis/feeds.ts";
import { useWidgetApi } from "../../widget-kit/apis.tsx";
import { type FeedState, nextState, refreshMs } from "./feed-view.ts";

/** The feed, how to read it again now, and whether a read is under way. */
export type LiveFeed = {
  readonly state: FeedState;
  readonly refresh: () => void;
  readonly refreshing: boolean;
};

/** The feed at `feedUrl`, read now and every `refreshMs` after while it shows, or on `refresh`. */
export const useFeed = (feedUrl: string, count: number): LiveFeed => {
  const feeds = useWidgetApi(feedsApi);
  const [state, setState] = useState<FeedState>(
    feedUrl === "" ? { is: "unset" } : { is: "loading" },
  );
  const [refreshing, setRefreshing] = useState(false);
  const readNow = useRef<() => void>(() => {});
  useEffect(() => {
    if (feedUrl === "") {
      setState({ is: "unset" });
      readNow.current = () => {};
      return;
    }
    setState({ is: "loading" });
    const stop = new AbortController();
    let timer = 0;
    // Reads it, then again `refreshMs` after: a manual refresh restarts the wait.
    const read = async () => {
      clearTimeout(timer);
      setRefreshing(true);
      const result = await feeds.read({ feedUrl, limit: count }, { signal: stop.signal });
      if (stop.signal.aborted) return;
      setState((prev) => nextState(prev, result));
      setRefreshing(false);
      timer = setTimeout(() => void read(), refreshMs);
    };
    readNow.current = () => void read();
    void read();
    return () => {
      stop.abort();
      clearTimeout(timer);
      setRefreshing(false);
    };
  }, [feeds, feedUrl, count]);
  const refresh = useCallback(() => readNow.current(), []);
  return { state, refresh, refreshing };
};

const reading = new Map<string, FeedItem>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Sets the item a widget's reader shows. */
export const readItem = (widgetId: string, item: FeedItem): void => {
  reading.set(widgetId, item);
  for (const listener of listeners) listener();
};

/** The item a widget's reader shows, or null before one's clicked. */
export const useReadItem = (widgetId: string): FeedItem | null =>
  useSyncExternalStore(subscribe, () => reading.get(widgetId) ?? null);
