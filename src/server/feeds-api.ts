/**
 * Serves the feeds widget API (src/common/apis/feeds.ts) on the main server: GETs
 * the feed through the httpGet pipe, follows redirects (to http(s) URLs only), and
 * answers with the parsed feed. Errors name the problem, never quoting what answered.
 */
import { Effect, Either } from "effect";
import { type Feed, feedsApi, type NotAFeed, type Unreachable } from "../common/apis/feeds.ts";
import type { ApiResult } from "../common/widget-apis.ts";
import { absoluteUrl, parseFeed } from "./feed-parse.ts";
import { type Bytes, ServerIo } from "./http.ts";
import { serve, type ServedApi } from "./widget-api-routes.ts";

/** The most redirects followed, to the feed. */
export const maxRedirects = 5;

/** The charset a content type names, or (for XML) its declaration does. */
export const charsetOf = (contentType: string | null, body: Bytes): string => {
  const header = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? "")?.at(1);
  if (header !== undefined) return header;
  const head = new TextDecoder("latin1").decode(body.subarray(0, 200));
  return /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.at(1) ?? "utf-8";
};

/** The body as text, in its charset (UTF-8 if it names one there's no decoder for). */
export const decodeBody = (contentType: string | null, body: Bytes): string => {
  const decoder = Either.getOrElse(
    Either.try(() => new TextDecoder(charsetOf(contentType, body))),
    () => new TextDecoder(),
  );
  return decoder.decode(body);
};

const notAFeed = (message: string) =>
  ({ ok: false, error: { is: "not-a-feed", message } }) as const;

const hostOf = (url: string): string => new URL(url).host;

/** Reads the feed at `url`, following up to `redirects` more redirects. */
const read = (
  url: string,
  limit: number,
  redirects: number,
): Effect.Effect<
  ApiResult<Feed, typeof NotAFeed.Type | typeof Unreachable.Type>,
  never,
  ServerIo
> =>
  Effect.gen(function* () {
    const io = yield* ServerIo;
    const got = yield* Effect.either(io.httpGet(url));
    if (Either.isLeft(got)) {
      return {
        ok: false,
        error: { is: "feed-unreachable", message: `Couldn't reach ${hostOf(url)}.` },
      } as const;
    }
    const { status, location, contentType, body } = got.right;
    if (status >= 300 && status < 400 && location !== null) {
      const next = absoluteUrl(location, url);
      if (next === null) return notAFeed("It redirects to something that isn't a web page.");
      if (redirects === 0) return notAFeed("It redirects too many times.");
      return yield* read(next, limit, redirects - 1);
    }
    if (status < 200 || status >= 300) {
      return notAFeed(`${hostOf(url)} answered with an error (${status}), not a feed.`);
    }
    if (body === null) return notAFeed("It's too big to be a feed.");
    const feed = parseFeed(decodeBody(contentType, body), url, limit);
    return feed === null
      ? notAFeed("That address isn't a feed (RSS, Atom or JSON Feed).")
      : { ok: true, value: feed } as const;
  });

export const feedsServed: ServedApi<ServerIo> = serve<typeof feedsApi, ServerIo>(feedsApi, {
  read: ({ feedUrl, limit }) => read(feedUrl, limit, maxRedirects),
});
