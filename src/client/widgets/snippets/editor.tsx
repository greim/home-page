/** Edits the heading, and the snippets: each one's label, text, and how it copies. */
import { Box, Button, HStack, Input, NativeSelect, Stack, Textarea } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { mapWhere, removeWhere } from "../../../common/arrays.ts";
import { Label, RowControls } from "../../widget-kit/form.tsx";
import { nudge } from "../../widget-kit/rows.ts";
import type { EditorProps } from "../../widget-kit/views.tsx";
import type { Snippet, SnippetCopy, SnippetsConfig } from "./config.ts";

const newId = () => crypto.randomUUID();

export function SnippetsEditor(props: EditorProps<SnippetsConfig>) {
  const { reportDraft } = props;
  const [heading, setHeadingState] = useState(props.config.heading);
  const [snippets, setSnippetsState] = useState(props.config.snippets);

  useEffect(() => reportDraft({ ok: true, config: props.config }), []);

  const setSnippets = (next: ReadonlyArray<Snippet>) => {
    setSnippetsState(next);
    reportDraft({ ok: true, config: { heading, snippets: next } });
  };

  const setHeading = (next: string) => {
    setHeadingState(next);
    reportDraft({ ok: true, config: { heading: next, snippets } });
  };

  return (
    <Stack gap="4">
      <Box>
        <Label>Heading</Label>
        <Input
          size="sm"
          value={heading}
          placeholder="None"
          onChange={(e) => setHeading(e.target.value)}
        />
      </Box>
      {snippets.map((s) => {
        const update = (patch: Partial<Snippet>) =>
          setSnippets(mapWhere(snippets, (x) => x.id === s.id, (x) => ({ ...x, ...patch })));
        return (
          <Box key={s.id} borderWidth="1px" rounded="md" p="3">
            <HStack mb="2">
              <Input
                size="sm"
                placeholder="Label"
                value={s.label}
                onChange={(e) => update({ label: e.target.value })}
              />
              <NativeSelect.Root size="sm" width="56">
                <NativeSelect.Field
                  value={s.copy}
                  onChange={(e) => update({ copy: e.target.value as SnippetCopy })}
                >
                  <option value="whole">Copy whole text</option>
                  <option value="char">Copy single character</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <RowControls
                onUp={() => setSnippets(nudge(snippets, s.id, -1))}
                onDown={() => setSnippets(nudge(snippets, s.id, 1))}
                onRemove={() => setSnippets(removeWhere(snippets, (x) => x.id === s.id))}
              />
            </HStack>
            <Textarea
              size="sm"
              fontFamily="mono"
              rows={3}
              placeholder="Text to copy"
              value={s.text}
              onChange={(e) => update({ text: e.target.value })}
            />
          </Box>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        alignSelf="start"
        onClick={() =>
          setSnippets([...snippets, { id: newId(), label: "", text: "", copy: "whole" }])}
      >
        <LuPlus /> Add snippet
      </Button>
    </Stack>
  );
}
