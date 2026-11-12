/**
 * The RSS feed widget's column view: the feed's title, then its latest headlines in
 * rows across the column's full width, each with its age and a link to its page.
 * Clicking a headline whose story the feed includes opens it full screen; otherwise
 * it's the link.
 */
import { chakra, Link, Text } from "@chakra-ui/react";
import { LuExternalLink, LuRefreshCw, LuRss } from "react-icons/lu";
import type { FeedItem } from "../../../common/apis/feeds.ts";
import { surface, widgetHeading } from "../../surface.ts";
import { useNow } from "../../widget-kit/now.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { RssFeedConfig } from "./config.ts";
import { readItem, useFeed } from "./feed-live.ts";
import { ageLabel, isPlainClick, opensInReader } from "./feed-view.ts";

const plainLink = {
  color: "inherit",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
} as const;

/** Hairlines: a dark one and a light one, as on the grooves between widgets. */
const darkLine = "1px solid rgba(0, 0, 0, 0.3)";
const lightLine = "1px solid rgba(255, 255, 255, 0.25)";

/** The rows: full width (out into the column's padding), on a darker band. */
const rows = {
  listStyle: "none",
  m: "0",
  p: "0",
  mx: `calc(-1 * ${surface.columnPaddingX})`,
  bg: "rgba(0, 0, 0, 0.1)",
  // Sunk into the column: a dark edge above, a light one below.
  borderTop: darkLine,
  borderBottom: lightLine,
  // Proportional, unlike the page's monospace, so more of each headline fits.
  fontFamily: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontSize: "0.9rem",
  lineHeight: "1.3",
} as const;

const row = {
  display: "grid",
  gridTemplateColumns: "2.1em minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "0.6em",
  ps: "0.8rem",
  pe: "1rem",
  py: "calc(0.1rem + 0.1em)",
  // A little more room inside the list's top and bottom edges.
  _first: { pt: "calc(0.1rem + 0.45em)" },
  _last: { pb: "calc(0.1rem + 0.45em)" },
  // Between rows, a groove: a dark line, then a light one right below it.
  _notLast: { borderBottom: darkLine },
  "& + &": { borderTop: lightLine },
  _hover: { bg: "rgba(255, 255, 255, 0.06)" },
} as const;

function Headline(props: { item: FeedItem; now: Date; onRead: () => void }) {
  const { item } = props;
  const reads = opensInReader(item);
  const title = <chakra.span truncate display="block" opacity={0.8}>{item.title}</chakra.span>;
  return (
    <chakra.li {...row}>
      <Text
        as="span"
        textAlign="end"
        fontSize="0.85em"
        opacity={0.45}
        fontVariantNumeric="tabular-nums"
      >
        {ageLabel(item.published, props.now)}
      </Text>
      {item.link === null && !reads ? title : (
        <Link
          color="inherit"
          // The row's own hover shows it's live, so no underline too.
          textDecoration="none"
          _hover={{ textDecoration: "none" }}
          display="block"
          minW="0"
          href={item.link ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={item.title}
          cursor="pointer"
          onClick={(e) => {
            if (reads && isPlainClick(e)) {
              e.preventDefault();
              props.onRead();
            }
          }}
        >
          {title}
        </Link>
      )}
      {item.link === null ? <span /> : (
        <Link
          href={item.link}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open “${item.title}” on its site`}
          title={item.link}
          color="inherit"
          opacity={0.6}
          _hover={{ opacity: 1 }}
          display="flex"
        >
          <LuExternalLink />
        </Link>
      )}
    </chakra.li>
  );
}

export function RssFeed({ config, widgetId, openFullScreen }: WidgetProps<RssFeedConfig>) {
  const { state, refresh, refreshing } = useFeed(config.feedUrl, config.count);
  const now = useNow();
  // A heading of its own, if it has one, stands in for the feed's title.
  const heading = (feedTitle: string, link: string | null) => {
    const title = config.heading === "" ? feedTitle : config.heading;
    return (
      <chakra.h3 {...widgetHeading} display="flex" alignItems="center" gap="0.35em">
        <chakra.span display="flex" flex="none" aria-hidden>
          <LuRss />
        </chakra.span>
        {/* One line: a long title ends in an ellipsis. */}
        <chakra.span flex="1" minW="0" truncate title={title}>
          {link === null
            ? title
            : <Link {...plainLink} href={link} target="_blank" rel="noreferrer">{title}</Link>}
        </chakra.span>
        {state.is !== "unset" && (
          <chakra.button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh the feed"
            title="Refresh"
            flex="none"
            display="flex"
            ms="0.3em"
            color="inherit"
            bg="transparent"
            border="none"
            p="0"
            cursor="pointer"
            opacity={0.6}
            _hover={{ opacity: 1 }}
            _disabled={{ cursor: "default", opacity: 0.6 }}
          >
            <chakra.span display="flex" animation={refreshing ? "spin 1s linear infinite" : "none"}>
              <LuRefreshCw />
            </chakra.span>
          </chakra.button>
        )}
      </chakra.h3>
    );
  };
  switch (state.is) {
    case "unset":
      return (
        <>
          {heading("News feed", null)}
          <Text opacity={0.7}>No feed yet: set its address in admin mode.</Text>
        </>
      );
    case "loading":
      return (
        <>
          {heading("News feed", null)}
          <Text opacity={0.7}>Reading the feed…</Text>
        </>
      );
    case "failed":
      return (
        <>
          {heading("News feed", null)}
          <Text opacity={0.8} title={config.feedUrl}>
            Couldn't read the feed. {state.message}
          </Text>
        </>
      );
    case "ready": {
      const { feed } = state;
      return (
        <>
          {heading(feed.title, feed.link)}
          {state.stale !== null && (
            <Text fontSize="0.85em" opacity={0.7} mb="0.5rem">
              Not updated: {state.stale}
            </Text>
          )}
          {feed.items.length === 0
            ? <Text opacity={0.7}>No headlines in it.</Text>
            : (
              <chakra.ul {...rows}>
                {feed.items.map((item) => (
                  <Headline
                    key={item.id}
                    item={item}
                    now={now}
                    onRead={() => {
                      readItem(widgetId, item);
                      openFullScreen();
                    }}
                  />
                ))}
              </chakra.ul>
            )}
        </>
      );
    }
  }
}
