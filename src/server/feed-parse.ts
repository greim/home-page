/**
 * Reads an RSS (2.0 or 1.0), Atom or JSON Feed document into the feeds API's `Feed`
 * (src/common/apis/feeds.ts): plain-text titles, absolute http(s) links, and item
 * bodies as sanitized HTML. Pure: text in, a feed (or null, for not a feed) out.
 */
import { Either, Option, Schema } from "effect";
import { XMLParser } from "fast-xml-parser";
// @ts-types="@types/sanitize-html"
import sanitizeHtml from "sanitize-html";
import type { Feed, FeedItem } from "../common/apis/feeds.ts";

/** A parsed XML node, as fast-xml-parser gives it. */
type Node = unknown;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  // Atom content keeps its markup, to read as its `type` says (XHTML is markup itself).
  stopNodes: ["feed.entry.content", "feed.entry.summary"],
  isArray: (name) => ["item", "entry", "link"].includes(name),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const field = (node: Node, name: string): Node => isRecord(node) ? node[name] : undefined;

const list = (node: Node): ReadonlyArray<Node> =>
  Array.isArray(node) ? node : node === undefined ? [] : [node];

/** A node's text: a string, or an element's text. */
const textOf = (node: Node): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  const text = field(node, "#text");
  return typeof text === "string" || typeof text === "number" ? String(text) : "";
};

const xmlEntities: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/** XML text as it was escaped in the document (as a stop node keeps it): CDATA and entities. */
export const unescapeXml = (raw: string): string =>
  raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, cdata, entity) => {
    if (typeof cdata === "string") return cdata;
    const e = String(entity);
    if (e.startsWith("#x") || e.startsWith("#X")) {
      return String.fromCodePoint(parseInt(e.slice(2), 16));
    }
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return xmlEntities[e.toLowerCase()] ?? all;
  });

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text from text that may hold markup or entities: titles. */
export const plainText = (text: string): string =>
  sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all) => unescapeXml(all))
    .replace(/\s+/g, " ")
    .trim();

/** `href` made absolute against `base`, if it's an http(s) URL. */
export const absoluteUrl = (href: string, base: string): string | null => {
  const trimmed = href.trim();
  if (trimmed === "" || !URL.canParse(trimmed, base)) return null;
  const url = new URL(trimmed, base);
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
};

/** The most a body may be, as HTML; longer ones are cut (and closed) by the sanitizer. */
const maxBodyChars = 200_000;

/**
 * HTML made safe to show in the page: a reading subset of tags, links and images with
 * absolute http(s) URLs, links opening in a new tab. Null when nothing's left to read.
 */
export const sanitizeBody = (html: string, base: string): string | null => {
  const safe = sanitizeHtml(html.slice(0, maxBodyChars), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "picture",
      "source",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "loading"],
      source: ["srcset", "type", "media"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    selfClosing: [...sanitizeHtml.defaults.selfClosing, "source"],
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href === undefined
          ? null
          : attribs.href.startsWith("mailto:")
          ? attribs.href
          : absoluteUrl(attribs.href, base);
        return {
          tagName,
          attribs: href === null ? {} : { href, target: "_blank", rel: "noopener noreferrer" },
        };
      },
      img: (tagName, attribs) => {
        const src = absoluteUrl(attribs.src ?? "", base);
        return {
          tagName,
          attribs: src === null
            ? {}
            : { src, alt: attribs.alt ?? "", loading: "lazy", ...pick(attribs, "title") },
        };
      },
      source: (tagName, attribs) => ({
        tagName,
        attribs: {
          srcset: absoluteSrcset(attribs.srcset ?? "", base),
          ...pick(attribs, "type", "media"),
        },
      }),
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && frame.attribs.src === undefined) ||
      (frame.tag === "source" && frame.attribs.srcset === ""),
  }).trim();
  const readable = safe !== "" && (/<img\s/.test(safe) || plainText(safe) !== "");
  return readable ? safe : null;
};

const pick = (attribs: Record<string, string>, ...names: ReadonlyArray<string>) =>
  Object.fromEntries(names.flatMap((n) => attribs[n] === undefined ? [] : [[n, attribs[n]]]));

/** A srcset with each URL absolute; candidates that aren't http(s) are dropped. */
const absoluteSrcset = (srcset: string, base: string): string =>
  srcset.split(",").flatMap((candidate) => {
    const [url = "", ...rest] = candidate.trim().split(/\s+/);
    const absolute = absoluteUrl(url, base);
    return absolute === null ? [] : [[absolute, ...rest].join(" ")];
  }).join(", ");

/** An ISO date from a feed's date text (RFC 822 or ISO 8601), or null. */
export const isoDate = (text: string): string | null => {
  if (text.trim() === "") return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

/** What every format's items come to, before they're named and limited. */
type RawItem = {
  readonly id: string;
  readonly title: string;
  readonly link: string | null;
  readonly published: string | null;
  readonly body: string | null;
};

type RawFeed = {
  readonly title: string;
  readonly link: string | null;
  readonly icon: string | null;
  readonly items: ReadonlyArray<RawItem>;
};

/** An item's title, or something to call it by when it has none. */
const itemTitle = (item: RawItem): string =>
  item.title !== ""
    ? item.title
    : item.published !== null
    ? item.published.slice(0, 10)
    : item.link ?? "Untitled";

/** Ids made unique, so a feed that repeats one still has an id per item. */
const uniqueIds = (items: ReadonlyArray<RawItem>): ReadonlyArray<RawItem> => {
  const seen = new Map<string, number>();
  return items.map((item, i) => {
    const id = item.id !== "" ? item.id : item.link ?? `item-${i}`;
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return { ...item, id: count === 0 ? id : `${id}#${count}` };
  });
};

const finish = (raw: RawFeed, feedUrl: string, limit: number): Feed => {
  const site = raw.link ?? feedUrl;
  return {
    title: raw.title !== "" ? raw.title : new URL(feedUrl).host,
    link: raw.link,
    icon: raw.icon ?? absoluteUrl("/favicon.ico", site),
    items: uniqueIds(raw.items.slice(0, limit)).map((item): FeedItem => ({
      ...item,
      title: itemTitle(item),
    })),
  };
};

// RSS 2.0, and RSS 1.0 (RDF), whose items sit beside its channel.

const rssItem = (node: Node, feedUrl: string): RawItem => {
  const link = absoluteUrl(textOf(list(field(node, "link")).at(0)), feedUrl);
  const html = textOf(field(node, "content:encoded")) || textOf(field(node, "description"));
  return {
    id: textOf(field(node, "guid")) || (link ?? ""),
    title: plainText(textOf(field(node, "title"))),
    link,
    published: isoDate(
      textOf(field(node, "pubDate")) || textOf(field(node, "dc:date")) ||
        textOf(field(node, "a10:updated")),
    ),
    body: html === "" ? null : sanitizeBody(html, link ?? feedUrl),
  };
};

/** A channel's site link: its first <link> with text (Atom links in RSS have none). */
const rssLink = (channel: Node, feedUrl: string): string | null =>
  list(field(channel, "link"))
    .map((l) => absoluteUrl(textOf(l), feedUrl))
    .find((l) => l !== null) ?? null;

const rss = (channel: Node, items: ReadonlyArray<Node>, feedUrl: string): RawFeed => ({
  title: plainText(textOf(field(channel, "title"))),
  link: rssLink(channel, feedUrl),
  icon: absoluteUrl(textOf(field(field(channel, "image"), "url")), feedUrl),
  items: items.map((item) => rssItem(item, feedUrl)),
});

// Atom.

/** An Atom link's href, by its rel ("alternate" when it has none). */
const atomLink = (node: Node, rel: string, base: string): string | null => {
  const links = list(field(node, "link"));
  const found = links.find((l) => (textOf(field(l, "@rel")) || "alternate") === rel);
  return found === undefined ? null : absoluteUrl(textOf(field(found, "@href")), base);
};

/** Atom text or content, as HTML, read as its `type` says (kept raw by a stop node). */
const atomHtml = (node: Node): string => {
  const raw = textOf(node);
  if (raw.trim() === "") return "";
  const type = textOf(field(node, "@type")) || "text";
  if (type === "xhtml") return raw;
  if (type === "html" || type === "text/html") return unescapeXml(raw);
  if (type === "text" || type === "text/plain") {
    return `<p>${escapeHtml(unescapeXml(raw)).replace(/\n{2,}/g, "</p><p>")}</p>`;
  }
  return ""; // a media type, or out-of-line content
};

const atomItem = (node: Node, feedUrl: string): RawItem => {
  const link = atomLink(node, "alternate", feedUrl);
  const html = atomHtml(field(node, "content")) || atomHtml(field(node, "summary"));
  return {
    id: textOf(field(node, "id")),
    title: plainText(textOf(field(node, "title"))),
    link,
    published: isoDate(textOf(field(node, "published")) || textOf(field(node, "updated"))),
    body: html === "" ? null : sanitizeBody(html, link ?? feedUrl),
  };
};

const atom = (feed: Node, feedUrl: string): RawFeed => ({
  title: plainText(textOf(field(feed, "title"))),
  link: atomLink(feed, "alternate", feedUrl),
  icon: absoluteUrl(textOf(field(feed, "icon")) || textOf(field(feed, "logo")), feedUrl),
  items: list(field(feed, "entry")).map((entry) => atomItem(entry, feedUrl)),
});

// JSON Feed.

const stringIn = (node: Node, name: string): string => {
  const v = field(node, name);
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
};

const jsonItem = (node: Node, feedUrl: string): RawItem => {
  const link = absoluteUrl(stringIn(node, "url"), feedUrl);
  const text = stringIn(node, "content_text") || stringIn(node, "summary");
  const html = stringIn(node, "content_html") || (text === "" ? "" : `<p>${escapeHtml(text)}</p>`);
  return {
    id: stringIn(node, "id"),
    title: plainText(stringIn(node, "title")),
    link,
    published: isoDate(stringIn(node, "date_published") || stringIn(node, "date_modified")),
    body: html === "" ? null : sanitizeBody(html, link ?? feedUrl),
  };
};

const jsonFeed = (doc: Node, feedUrl: string): RawFeed | null => {
  if (!stringIn(doc, "version").startsWith("https://jsonfeed.org/version/")) return null;
  const items = field(doc, "items");
  return {
    title: plainText(stringIn(doc, "title")),
    link: absoluteUrl(stringIn(doc, "home_page_url"), feedUrl),
    icon: absoluteUrl(stringIn(doc, "icon") || stringIn(doc, "favicon"), feedUrl),
    items: (Array.isArray(items) ? items : []).map((item) => jsonItem(item, feedUrl)),
  };
};

/** The JSON in `text`, or null if it isn't JSON (so not a JSON Feed). */
const parseJson = (text: string): Node =>
  Option.getOrNull(Schema.decodeUnknownOption(Schema.parseJson())(text));

/** The XML in `text`, or null if it isn't XML (so not an RSS or Atom feed). */
const parseXml = (text: string): Node =>
  Either.getOrNull(Either.try(() => xml.parse(text) as unknown));

/** The feed in `text`, fetched from `feedUrl`, with at most `limit` items; null if it isn't one. */
export const parseFeed = (text: string, feedUrl: string, limit: number): Feed | null => {
  const start = text.trimStart();
  if (start.startsWith("{")) {
    const raw = jsonFeed(parseJson(start), feedUrl);
    return raw === null ? null : finish(raw, feedUrl, limit);
  }
  if (!start.startsWith("<")) return null;
  const doc = parseXml(start);
  const channel = field(field(doc, "rss"), "channel");
  if (channel !== undefined) {
    return finish(rss(channel, list(field(channel, "item")), feedUrl), feedUrl, limit);
  }
  const rdf = field(doc, "rdf:RDF");
  if (rdf !== undefined) {
    return finish(rss(field(rdf, "channel"), list(field(rdf, "item")), feedUrl), feedUrl, limit);
  }
  const feed = field(doc, "feed");
  return feed === undefined ? null : finish(atom(feed, feedUrl), feedUrl, limit);
};
