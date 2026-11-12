/** The RSS feed widget: a feed's latest headlines, and its stories to read full screen. */
import { Box, Input, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import {
  type EditorProps,
  editorView,
  fullScreenView,
  widgetView,
} from "../../widget-kit/views.tsx";
import { maxCount, RssFeedConfig } from "./config.ts";
import { checkFeedUrl } from "./feed-view.ts";
import { RssFeedReader } from "./reader.tsx";
import { RssFeed } from "./rss-feed.tsx";

function RssFeedEditor({ config, reportDraft }: EditorProps<RssFeedConfig>) {
  const [url, setUrl] = useState(config.feedUrl);
  const [count, setCount] = useState(String(config.count));
  const [heading, setHeading] = useState(config.heading);
  const report = (nextUrl: string, nextCount: string, nextHeading: string) => {
    const checked = checkFeedUrl(nextUrl);
    const n = Number(nextCount);
    if (!checked.ok) return reportDraft({ ok: false, errorMessage: checked.errorMessage });
    if (!Number.isInteger(n) || n < 1 || n > maxCount) {
      return reportDraft({
        ok: false,
        errorMessage: `Show between 1 and ${maxCount} headlines.`,
      });
    }
    reportDraft({
      ok: true,
      config: { feedUrl: checked.url, count: n, heading: nextHeading.trim() },
    });
  };
  // Report on open too, even with nothing changed, or Save can't apply it.
  useEffect(() => report(url, count, heading), []);
  return (
    <Stack gap="4">
      <Box>
        <Label>Feed address</Label>
        <Input
          size="sm"
          value={url}
          placeholder="https://example.com/feed.xml"
          onChange={(e) => {
            setUrl(e.target.value);
            report(e.target.value, count, heading);
          }}
        />
        <Text fontSize="xs" color="fg.muted" mt="1">
          The feed's own address (RSS, Atom or JSON Feed), not its site's home page.
        </Text>
      </Box>
      <Box>
        <Label>Heading</Label>
        <Input
          size="sm"
          value={heading}
          placeholder="The feed's own title"
          onChange={(e) => {
            setHeading(e.target.value);
            report(url, count, e.target.value);
          }}
        />
        <Text fontSize="xs" color="fg.muted" mt="1">
          Shown in place of the feed's title, still linked to its site. Leave it blank for the
          feed's title.
        </Text>
      </Box>
      <Box>
        <Label>Headlines to show</Label>
        <Input
          size="sm"
          w="6rem"
          type="number"
          min={1}
          max={maxCount}
          value={count}
          onChange={(e) => {
            setCount(e.target.value);
            report(url, e.target.value, heading);
          }}
        />
      </Box>
    </Stack>
  );
}

registerMfe("rss-feed", () => ({
  widget: widgetView(RssFeedConfig, RssFeed),
  editor: editorView(RssFeedConfig, RssFeedEditor),
  "full-screen": fullScreenView(RssFeedConfig, RssFeedReader),
}));
