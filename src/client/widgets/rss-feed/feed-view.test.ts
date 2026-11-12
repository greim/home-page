import { assertEquals } from "@std/assert";
import type { Feed, FeedItem } from "../../../common/apis/feeds.ts";
import {
  ageLabel,
  checkFeedUrl,
  type FeedState,
  isPlainClick,
  nextState,
  opensInReader,
  publishedLabel,
} from "./feed-view.ts";

const feed: Feed = { title: "F", link: null, icon: null, items: [] };
const failed = { ok: false, error: { message: "Couldn't reach a.example." } } as const;

Deno.test("a read shows the feed; a failed one says why, or keeps the feed it had", () => {
  const ready: FeedState = { is: "ready", feed, stale: null };
  assertEquals(nextState({ is: "loading" }, { ok: true, value: feed }), ready);
  assertEquals(nextState({ is: "loading" }, failed), {
    is: "failed",
    message: "Couldn't reach a.example.",
  });
  assertEquals(nextState(ready, failed), { ...ready, stale: "Couldn't reach a.example." });
  assertEquals(nextState({ ...ready, stale: "x" }, { ok: true, value: feed }), ready);
});

Deno.test("an item opens to read only if it has a body", () => {
  const item: FeedItem = { id: "1", title: "T", link: null, published: null, body: null };
  assertEquals(opensInReader(item), false);
  assertEquals(opensInReader({ ...item, body: "<p>Hi</p>" }), true);
});

Deno.test("only a plain left click is taken over", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assertEquals(isPlainClick(click), true);
  assertEquals(isPlainClick({ ...click, metaKey: true }), false);
  assertEquals(isPlainClick({ ...click, button: 1 }), false);
});

Deno.test("a published date is shown as a date, if there is one", () => {
  assertEquals(publishedLabel("2026-11-10T12:00:00.000Z", "en-US"), "Nov 10, 2026");
  assertEquals(publishedLabel(null), null);
});

Deno.test("a typed feed URL is checked, assuming https", () => {
  assertEquals(checkFeedUrl(" example.com/feed "), { ok: true, url: "https://example.com/feed" });
  assertEquals(checkFeedUrl("http://a.example/rss"), { ok: true, url: "http://a.example/rss" });
  assertEquals(checkFeedUrl(""), { ok: true, url: "" });
  assertEquals(checkFeedUrl("ftp://a.example/").ok, false);
  assertEquals(checkFeedUrl("https://").ok, false);
});

Deno.test("an item's age is shown as briefly as fits a column", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const ago = (ms: number) => ageLabel(new Date(now.getTime() - ms).toISOString(), now);
  const m = 60_000, h = 60 * m, d = 24 * h;
  assertEquals(
    [ago(30_000), ago(2 * m), ago(3 * h), ago(d), ago(6 * d), ago(7 * d), ago(29 * d)],
    ["now", "2m", "3h", "1d", "6d", "1w", "4w"],
  );
  assertEquals([ago(30 * d), ago(364 * d), ago(800 * d)], ["1mo", "12mo", "2y"]);
  assertEquals(ago(-5 * m), "now"); // a clock that runs ahead
  assertEquals(ageLabel(null, now), "");
});
