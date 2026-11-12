import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  absoluteUrl,
  isoDate,
  parseFeed,
  plainText,
  sanitizeBody,
  unescapeXml,
} from "./feed-parse.ts";

const feedUrl = "https://example.com/feed.xml";

const rss2 = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Tom &amp; Jerry's Blog</title>
    <link>https://example.com/</link>
    <image><url>/icon.png</url></image>
    <item>
      <title>First &lt;b&gt;post&lt;/b&gt;</title>
      <link>https://example.com/1</link>
      <guid>post-1</guid>
      <pubDate>Tue, 10 Nov 2026 09:00:00 GMT</pubDate>
      <description>A summary</description>
      <content:encoded><![CDATA[<p onclick="x()">Full <a href="/more">text</a></p><script>bad()</script>]]></content:encoded>
    </item>
    <item>
      <title>Second</title>
      <link>/2</link>
      <description>&lt;p&gt;Only a summary&lt;/p&gt;</description>
    </item>
    <item>
      <title>Third, bare</title>
      <link>https://example.com/3</link>
    </item>
  </channel>
</rss>`;

Deno.test("an RSS 2.0 feed: its title, site, icon and items, newest first", () => {
  const feed = parseFeed(rss2, feedUrl, 10);
  assertEquals(feed?.title, "Tom & Jerry's Blog");
  assertEquals(feed?.link, "https://example.com/");
  assertEquals(feed?.icon, "https://example.com/icon.png");
  assertEquals(feed?.items.map((i) => [i.id, i.title, i.link]), [
    ["post-1", "First post", "https://example.com/1"],
    ["https://example.com/2", "Second", "https://example.com/2"],
    ["https://example.com/3", "Third, bare", "https://example.com/3"],
  ]);
  assertEquals(feed?.items.at(0)?.published, "2026-11-10T09:00:00.000Z");
});

Deno.test("an item's body is its full content if it has it, else its summary, sanitized", () => {
  const [first, second, third] = parseFeed(rss2, feedUrl, 10)?.items ?? [];
  assertEquals(
    first?.body,
    '<p>Full <a href="https://example.com/more" target="_blank" rel="noopener noreferrer">text</a></p>',
  );
  assertEquals(second?.body, "<p>Only a summary</p>");
  assertEquals(third?.body, null);
});

Deno.test("only `limit` items are kept", () => {
  assertEquals(parseFeed(rss2, feedUrl, 1)?.items.length, 1);
});

Deno.test("an RSS 1.0 (RDF) feed, whose items sit beside its channel", () => {
  const feed = parseFeed(
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
       xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>Old School</title><link>https://old.example/</link></channel>
      <item><title>One</title><link>https://old.example/1</link><dc:date>2026-11-01T00:00:00Z</dc:date></item>
    </rdf:RDF>`,
    "https://old.example/index.rdf",
    10,
  );
  assertEquals(feed?.title, "Old School");
  assertEquals(feed?.icon, "https://old.example/favicon.ico");
  assertEquals(feed?.items.map((i) => [i.title, i.published]), [
    ["One", "2026-11-01T00:00:00.000Z"],
  ]);
});

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">An Atom Feed</title>
  <link rel="self" href="https://atom.example/feed"/>
  <link href="https://atom.example/"/>
  <icon>https://atom.example/i.png</icon>
  <entry>
    <title>Escaped</title>
    <id>tag:atom.example,2026:1</id>
    <link rel="alternate" href="/posts/1"/>
    <updated>2026-11-09T12:00:00Z</updated>
    <content type="html">&lt;p&gt;Hello &lt;img src="pic.jpg" onerror="x()"&gt;&lt;/p&gt;</content>
  </entry>
  <entry>
    <title>XHTML</title>
    <id>tag:atom.example,2026:2</id>
    <link href="https://atom.example/posts/2"/>
    <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Some <em>markup</em></p></div></content>
  </entry>
  <entry>
    <title>Text, with a summary</title>
    <id>tag:atom.example,2026:3</id>
    <summary>Line one &amp; two

Paragraph &lt;two&gt;</summary>
  </entry>
</feed>`;

Deno.test("an Atom feed, its content read as its type says", () => {
  const feed = parseFeed(atom, "https://atom.example/feed", 10);
  assertEquals(feed?.title, "An Atom Feed");
  assertEquals(feed?.link, "https://atom.example/");
  assertEquals(feed?.icon, "https://atom.example/i.png");
  const [escaped, xhtml, text] = feed?.items ?? [];
  assertEquals(escaped?.link, "https://atom.example/posts/1");
  assertEquals(escaped?.published, "2026-11-09T12:00:00.000Z");
  assertEquals(
    escaped?.body,
    '<p>Hello <img src="https://atom.example/posts/pic.jpg" alt="" loading="lazy" /></p>',
  );
  assertEquals(xhtml?.body, "<div><p>Some <em>markup</em></p></div>");
  assertEquals(text?.link, null);
  assertEquals(text?.body, "<p>Line one &amp; two</p><p>Paragraph &lt;two&gt;</p>");
});

Deno.test("a JSON Feed", () => {
  const feed = parseFeed(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Jason",
      home_page_url: "https://json.example/",
      favicon: "/fav.png",
      items: [
        { id: 1, url: "https://json.example/a", title: "A", content_html: "<p>Hi</p>" },
        { id: "b", content_text: "No title, <just> text", date_published: "2026-11-02T00:00:00Z" },
      ],
    }),
    "https://json.example/feed.json",
    10,
  );
  assertEquals(feed?.title, "Jason");
  assertEquals(feed?.icon, "https://json.example/fav.png");
  assertEquals(feed?.items, [
    { id: "1", title: "A", link: "https://json.example/a", published: null, body: "<p>Hi</p>" },
    {
      id: "b",
      title: "2026-11-02",
      link: null,
      published: "2026-11-02T00:00:00.000Z",
      body: "<p>No title, &lt;just&gt; text</p>",
    },
  ]);
});

Deno.test("what isn't a feed is null", () => {
  assertEquals(parseFeed("<!doctype html><html><body>Hi</body></html>", feedUrl, 10), null);
  assertEquals(parseFeed('{"not": "a feed"}', feedUrl, 10), null);
  assertEquals(parseFeed("{broken", feedUrl, 10), null);
  assertEquals(parseFeed("plain text", feedUrl, 10), null);
  assertEquals(parseFeed("<rss><channel><title>x</ti", feedUrl, 10)?.title ?? null, null);
});

Deno.test("a feed without a title is named by its host, and repeated ids are made unique", () => {
  const feed = parseFeed(
    "<rss><channel><item><guid>x</guid><title>A</title></item><item><guid>x</guid></item></channel></rss>",
    feedUrl,
    10,
  );
  assertEquals(feed?.title, "example.com");
  assertEquals(feed?.items.map((i) => [i.id, i.title]), [["x", "A"], ["x#1", "Untitled"]]);
});

Deno.test("bodies keep only safe markup", () => {
  const body = sanitizeBody(
    `<p style="color:red">Hi <a href="javascript:alert(1)">bad</a> <a href="mailto:a@b.c">mail</a></p>
     <iframe src="https://evil.example"></iframe><img src="data:image/png;base64,AAAA">
     <picture><source srcset="/a.webp 1x, javascript:x 2x"></picture>`,
    "https://example.com/post",
  ) ?? "";
  assertEquals(body.includes("style"), false);
  assertEquals(body.includes("javascript"), false);
  assertEquals(body.includes("iframe"), false);
  assertEquals(body.includes("data:"), false);
  assertStringIncludes(body, '<a href="mailto:a@b.c"');
  assertStringIncludes(body, '<source srcset="https://example.com/a.webp 1x" />');
  assertEquals(sanitizeBody("<p> </p><script>x</script>", feedUrl), null);
  assertEquals(
    sanitizeBody('<img src="/a.png">', feedUrl),
    '<img src="https://example.com/a.png" alt="" loading="lazy" />',
  );
});

Deno.test("helpers: plain text, unescaping, URLs and dates", () => {
  assertEquals(plainText("  A <b>bold</b>\n &amp; true  "), "A bold & true");
  assertEquals(unescapeXml("<![CDATA[<p>]]> &lt;&#65;&#x42;&bogus;"), "<p> <AB&bogus;");
  assertEquals(absoluteUrl("/x", "https://a.example/b/c"), "https://a.example/x");
  assertEquals(absoluteUrl("ftp://a.example/", "https://a.example/"), null);
  assertEquals(absoluteUrl("  ", "https://a.example/"), null);
  assertEquals(isoDate("not a date"), null);
  assertEquals(isoDate(""), null);
});
