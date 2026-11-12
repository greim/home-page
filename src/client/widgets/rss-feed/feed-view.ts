/** What the RSS feed widget shows, decided from the feed and the settings. */
import type { Feed, FeedItem } from "../../../common/apis/feeds.ts";
import type { ApiResult } from "../../../common/widget-apis.ts";

/** How often a showing feed is read again. */
export const refreshMs = 15 * 60_000;

/** What the column shows. */
export type FeedState =
  | { readonly is: "unset" }
  | { readonly is: "loading" }
  | { readonly is: "failed"; readonly message: string }
  /** `stale` says why the last refresh failed, while the feed as last read shows. */
  | { readonly is: "ready"; readonly feed: Feed; readonly stale: string | null };

/** The state after a read: a failed refresh keeps the feed it had, saying why it's stale. */
export const nextState = (
  prev: FeedState,
  result: ApiResult<Feed, { readonly message: string }>,
): FeedState =>
  result.ok
    ? { is: "ready", feed: result.value, stale: null }
    : prev.is === "ready"
    ? { ...prev, stale: result.error.message }
    : { is: "failed", message: result.error.message };

/** Whether clicking an item opens it to read full screen (it has a body), or follows its link. */
export const opensInReader = (item: FeedItem): boolean => item.body !== null;

/** Whether a click is a plain one, which the page may take over (not one opening a new tab). */
export const isPlainClick = (e: {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** When an item was published, to show: a date in `locale`, or null if the feed doesn't say. */
export const publishedLabel = (published: string | null, locale?: string): string | null =>
  published === null
    ? null
    : new Date(published).toLocaleDateString(locale, { dateStyle: "medium" });

/** The editor's check of a typed feed URL: `https://` is assumed when it has no scheme. */
export const checkFeedUrl = (
  text: string,
): { readonly ok: true; readonly url: string } | {
  readonly ok: false;
  readonly errorMessage: string;
} => {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, url: "" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!URL.canParse(withScheme)) return { ok: false, errorMessage: "That isn't a web address." };
  const url = new URL(withScheme);
  return url.protocol === "http:" || url.protocol === "https:"
    ? { ok: true, url: url.href }
    : { ok: false, errorMessage: "A feed's address starts with http:// or https://." };
};

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/**
 * How long ago an item was published, as briefly as fits a column: "now", "5m",
 * "3h", "2d", "1w", "4mo", "2y". Blank if the feed doesn't say.
 */
export const ageLabel = (published: string | null, now: Date): string => {
  if (published === null) return "";
  const age = Math.max(0, now.getTime() - new Date(published).getTime());
  if (age < minute) return "now";
  if (age < hour) return `${Math.floor(age / minute)}m`;
  if (age < day) return `${Math.floor(age / hour)}h`;
  if (age < 7 * day) return `${Math.floor(age / day)}d`;
  if (age < 30 * day) return `${Math.floor(age / (7 * day))}w`;
  if (age < 365 * day) return `${Math.floor(age / (30 * day))}mo`;
  return `${Math.floor(age / (365 * day))}y`;
};
