/**
 * The RSS feed widget's full-screen view: the story clicked in the column, as the
 * feed gives it. Its HTML comes sanitized by the feeds API, and is rendered as a
 * checked tree (see story-tree.ts), never as HTML.
 */
import { Box, chakra, Heading, HStack, Link, Text } from "@chakra-ui/react";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { LuExternalLink } from "react-icons/lu";
import type { FullScreenProps } from "../../widget-kit/views.tsx";
import type { RssFeedConfig } from "./config.ts";
import { useReadItem } from "./feed-live.ts";
import { publishedLabel } from "./feed-view.ts";
import { storyTree } from "./story-tree.ts";

/** A story's HTML as React elements: parsed (which runs nothing), then checked as a tree. */
function Story(props: { html: string }) {
  const content = useMemo(() => {
    const parsed = new DOMParser().parseFromString(props.html, "text/html");
    return toJsxRuntime(storyTree(parsed.body.childNodes), { Fragment, jsx, jsxs });
  }, [props.html]);
  return <chakra.div css={story}>{content}</chakra.div>;
}

/** How a story's HTML is laid out, in ems of its font size. */
const story = {
  lineHeight: "1.6",
  overflowWrap: "anywhere",
  "& > :first-child": { mt: 0 },
  "& :is(p, ul, ol, pre, blockquote, table, figure, hr)": { my: "0.9em" },
  "& :is(h1, h2, h3, h4, h5, h6)": {
    fontWeight: "bold",
    lineHeight: "1.25",
    mt: "1.2em",
    mb: "0.5em",
  },
  "& h1": { fontSize: "1.5em" },
  "& h2": { fontSize: "1.3em" },
  "& h3": { fontSize: "1.15em" },
  "& :is(ul, ol)": { ps: "1.8em" },
  "& ul": { listStyleType: "disc" },
  "& ol": { listStyleType: "decimal" },
  "& li + li": { mt: "0.3em" },
  "& a": { color: "fg", textDecoration: "underline", textUnderlineOffset: "0.15em" },
  "& :is(strong, b)": { fontWeight: "bold" },
  "& :is(em, i)": { fontStyle: "italic" },
  "& code": {
    fontFamily: "mono",
    fontSize: "0.9em",
    bg: "bg.muted",
    borderRadius: "0.2em",
    px: "0.25em",
  },
  "& pre": {
    bg: "bg.muted",
    borderRadius: "0.3em",
    px: "0.8em",
    py: "0.6em",
    whiteSpace: "pre-wrap",
  },
  "& pre code": { bg: "transparent", p: 0 },
  "& blockquote": {
    borderStartWidth: "0.2em",
    borderColor: "border",
    ps: "0.9em",
    color: "fg.muted",
  },
  "& hr": { borderTopWidth: "1px", borderColor: "border" },
  "& table": { borderCollapse: "collapse", fontSize: "0.95em" },
  "& :is(th, td)": { borderWidth: "1px", borderColor: "border", px: "0.5em", py: "0.25em" },
  "& :is(img, video, picture)": {
    display: "block",
    maxW: "100%",
    h: "auto",
    borderRadius: "0.3em",
  },
  "& figcaption": { fontSize: "0.9em", color: "fg.muted", mt: "0.4em" },
} as const;

export function RssFeedReader({ widgetId }: FullScreenProps<RssFeedConfig>) {
  const item = useReadItem(widgetId);
  if (item === null) {
    return (
      <Box h="full" bg="bg" color="fg" p="6">
        <Text color="fg.muted">Click a headline in the column to read it here.</Text>
      </Box>
    );
  }
  const date = publishedLabel(item.published);
  return (
    <Box h="full" overflowY="auto" bg="bg" color="fg">
      <Box maxW="42em" mx="auto" px="6" py="6" fontSize="md">
        <Heading as="h2" size="xl" lineHeight="1.25" mb="2">{item.title}</Heading>
        <HStack gap="4" color="fg.muted" fontSize="sm" mb="6" wrap="wrap">
          {date !== null && <Text>{date}</Text>}
          {item.link !== null && (
            <Link href={item.link} target="_blank" rel="noreferrer" color="fg.muted">
              Read it on the site <LuExternalLink />
            </Link>
          )}
        </HStack>
        {item.body !== null && <Story html={item.body} />}
      </Box>
    </Box>
  );
}
