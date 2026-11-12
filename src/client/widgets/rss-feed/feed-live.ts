/**
 * Reading the feed through the feeds API, again every so often while it shows; and
 * handing the item clicked to the full-screen reader. Both views run in this bundle,
 * so the handoff is just memory, kept per widget until the page reloads.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { type FeedItem, feedsApi } from "../../../common/apis/feeds.ts";
import { useWidgetApi } from "../../widget-kit/apis.tsx";
import { type FeedState, nextState, refreshMs } from "./feed-view.ts";

/** The feed at `feedUrl`, read now and every `refreshMs` after, while it shows. */
export const useFeed = (feedUrl: string, count: number): FeedState => {
  const feeds = useWidgetApi(feedsApi);
  const [state, setState] = useState<FeedState>(
    feedUrl === "" ? { is: "unset" } : { is: "loading" },
  );
  useEffect(() => {
    if (feedUrl === "") {
      setState({ is: "unset" });
      return;
    }
    setState({ is: "loading" });
    const stop = new AbortController();
    const read = async () => {
      const result = await feeds.read({ feedUrl, limit: count }, { signal: stop.signal });
      if (!stop.signal.aborted) setState((prev) => nextState(prev, result));
    };
    void read();
    const timer = setInterval(() => void read(), refreshMs);
    return () => {
      stop.abort();
      clearInterval(timer);
    };
  }, [feeds, feedUrl, count]);
  return state;
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
