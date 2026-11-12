/**
 * The feeds widget API: reading an RSS, Atom or JSON Feed, on the main server, which
 * can fetch what the page can't (few feeds allow cross-origin requests). See the
 * `widget-apis` skill.
 *
 * It fetches any http(s) URL a widget names, the LAN and localhost included: the user
 * could visit those themselves. But it answers only with a parsed feed, never the raw
 * text of what answered, and its errors don't quote it either. So it can't be used
 * to read anything but feeds.
 */
import { Schema } from "effect";
import { apiError, defineApi, operation } from "../widget-apis.ts";

/** The URL didn't answer with a feed: it failed, or what it served isn't one. */
export const NotAFeed = apiError("not-a-feed");

/** The URL couldn't be reached at all (no such host, it timed out, ...). */
export const Unreachable = apiError("feed-unreachable");

/** An http(s) URL. */
export const HttpUrl = Schema.String.pipe(
  Schema.filter((s) => URL.canParse(s) && /^https?:$/.test(new URL(s).protocol), {
    message: () => "a feed's URL starts with http:// or https://",
  }),
);

export const FeedItem = Schema.Struct({
  /** Unique within the feed: its guid or id, else its link. */
  id: Schema.String,
  /** Plain text. Never empty: an item without a title is named by its date or link. */
  title: Schema.String,
  /** The item's page, if it has one (an http(s) URL). */
  link: Schema.NullOr(Schema.String),
  /** When it was published (or last updated), as an ISO date, if the feed says. */
  published: Schema.NullOr(Schema.String),
  /**
   * Its content as HTML, sanitized: no scripts, styles or event handlers, links and
   * images absolute http(s) URLs, links opening in a new tab. Its full content if the
   * feed has it, else its summary; null if it has neither.
   */
  body: Schema.NullOr(Schema.String),
});
export type FeedItem = typeof FeedItem.Type;

export const Feed = Schema.Struct({
  /** Plain text: the feed's title, or its host when it has none. */
  title: Schema.String,
  /** The site's home page, if the feed says. */
  link: Schema.NullOr(Schema.String),
  /** An icon for it: the feed's own, or its site's /favicon.ico (which may not exist). */
  icon: Schema.NullOr(Schema.String),
  /** Newest first, as the feed lists them. */
  items: Schema.Array(FeedItem),
});
export type Feed = typeof Feed.Type;

export const feedsApi = defineApi("feeds", "main", {
  /** Reads a feed: its title, icon, and up to `limit` of its items. */
  read: operation({
    input: Schema.Struct({
      /** The feed's own URL (not its site's page). */
      feedUrl: HttpUrl,
      /** The most items to answer with. */
      limit: Schema.Int.pipe(Schema.between(1, 100)),
    }),
    output: Feed,
    errors: Schema.Union(NotAFeed, Unreachable),
  }),
}, { services: [] });

export type FeedsApi = typeof feedsApi;
