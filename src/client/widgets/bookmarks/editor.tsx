/**
 * Edits the heading, and the bookmarks as an outline: `Label | URL` per line,
 * folders with their links indented.
 */
import { Box, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Label } from "../../widget-kit/form.tsx";
import type { EditorProps } from "../../widget-kit/views.tsx";
import type { BookmarksConfig } from "./config.ts";
import { parseOutline, serializeOutline } from "./outline.ts";

const newId = () => crypto.randomUUID();

export function BookmarksEditor(props: EditorProps<BookmarksConfig>) {
  const { config, reportDraft } = props;
  const [heading, setHeading] = useState(config.heading);
  const [outline, setOutline] = useState(() => serializeOutline(config.items));

  // Unedited, the draft is the config as it was.
  useEffect(() => reportDraft({ ok: true, config }), []);

  const report = (nextHeading: string, nextOutline: string) => {
    const parsed = parseOutline(nextOutline, config.items, newId);
    reportDraft(
      parsed.ok
        ? { ok: true, config: { ...config, heading: nextHeading, items: parsed.items } }
        : parsed,
    );
  };

  const change = (next: string) => {
    setOutline(next);
    report(heading, next);
  };

  return (
    <Stack gap="4">
      <Box>
        <Label>Heading</Label>
        <Input
          size="sm"
          value={heading}
          placeholder="None"
          onChange={(e) => {
            setHeading(e.target.value);
            report(e.target.value, outline);
          }}
        />
        <Text fontSize="xs" color="fg.muted" mt="1">
          Click it on the page to open or close the bookmarks. Without one, they're always open.
        </Text>
      </Box>
      <Box>
        <Label>Bookmarks</Label>
        <Text fontSize="xs" color="fg.muted" mb="2">
          One per line as{" "}
          <code>Label | URL</code>. A line without a URL is a folder; indent the links below it to
          put them inside.
        </Text>
        <Textarea
          fontFamily="mono"
          fontSize="sm"
          rows={14}
          value={outline}
          placeholder="Mail | https://mail.example.com
Work
  Repo | https://git.example.com"
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            // Let Tab indent instead of moving focus.
            if (e.key !== "Tab") return;
            e.preventDefault();
            const t = e.currentTarget;
            const at = t.selectionStart;
            change(outline.slice(0, at) + "  " + outline.slice(t.selectionEnd));
            requestAnimationFrame(() => t.setSelectionRange(at + 2, at + 2));
          }}
        />
      </Box>
    </Stack>
  );
}
