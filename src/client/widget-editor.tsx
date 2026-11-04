import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from "react-icons/lu";
import { mapWhere, removeWhere } from "../common/arrays.ts";
import type { FormGridWidget, GridColumns, SnippetCopy, SnippetsWidget } from "../common/model.ts";
import { placeholder } from "../common/url-template.ts";
import { type Draft, nudge } from "./widget-draft.ts";

const newId = () => crypto.randomUUID();

function RowControls(props: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <HStack gap="0">
      <IconButton aria-label="Move up" size="xs" variant="ghost" onClick={props.onUp}>
        <LuArrowUp />
      </IconButton>
      <IconButton aria-label="Move down" size="xs" variant="ghost" onClick={props.onDown}>
        <LuArrowDown />
      </IconButton>
      <IconButton aria-label="Remove" size="xs" variant="ghost" onClick={props.onRemove}>
        <LuTrash2 />
      </IconButton>
    </HStack>
  );
}

export function Label(props: { children: string }) {
  return <Text fontSize="sm" fontWeight="medium" mb="1">{props.children}</Text>;
}

function SnippetsEditor(props: {
  widget: SnippetsWidget;
  onChange: (w: SnippetsWidget) => void;
}) {
  const { widget, onChange } = props;
  const setSnippets = (snippets: SnippetsWidget["snippets"]) => onChange({ ...widget, snippets });
  return (
    <Stack gap="4">
      {widget.snippets.map((s) => {
        const update = (patch: Partial<typeof s>) =>
          setSnippets(mapWhere(widget.snippets, (x) => x.id === s.id, (x) => ({ ...x, ...patch })));
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
                onUp={() => setSnippets(nudge(widget.snippets, s.id, -1))}
                onDown={() => setSnippets(nudge(widget.snippets, s.id, 1))}
                onRemove={() => setSnippets(removeWhere(widget.snippets, (x) => x.id === s.id))}
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
          setSnippets([...widget.snippets, { id: newId(), label: "", text: "", copy: "whole" }])}
      >
        <LuPlus /> Add snippet
      </Button>
    </Stack>
  );
}

function FormGridEditor(props: {
  widget: FormGridWidget;
  onChange: (w: FormGridWidget) => void;
}) {
  const { widget, onChange } = props;
  const setFields = (fields: FormGridWidget["fields"]) => onChange({ ...widget, fields });
  return (
    <Stack gap="3">
      <Box>
        <Label>Grid columns</Label>
        <NativeSelect.Root size="sm" width="24">
          <NativeSelect.Field
            value={widget.gridColumns}
            onChange={(e) =>
              onChange({ ...widget, gridColumns: Number(e.target.value) as GridColumns })}
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Box>
      <Text fontSize="xs" color="fg.muted">
        Each field opens its URL template in a new tab, with {placeholder}{" "}
        replaced by what you type.
      </Text>
      {widget.fields.map((f) => {
        const update = (patch: Partial<typeof f>) =>
          setFields(mapWhere(widget.fields, (x) => x.id === f.id, (x) => ({ ...x, ...patch })));
        return (
          <HStack key={f.id}>
            <Input
              size="sm"
              width="40%"
              placeholder="Placeholder label"
              value={f.label}
              onChange={(e) => update({ label: e.target.value })}
            />
            <Input
              size="sm"
              fontFamily="mono"
              placeholder={`https://example.com/search?q=${placeholder}`}
              value={f.urlTemplate}
              onChange={(e) => update({ urlTemplate: e.target.value })}
            />
            <RowControls
              onUp={() => setFields(nudge(widget.fields, f.id, -1))}
              onDown={() => setFields(nudge(widget.fields, f.id, 1))}
              onRemove={() => setFields(removeWhere(widget.fields, (x) => x.id === f.id))}
            />
          </HStack>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        alignSelf="start"
        onClick={() => setFields([...widget.fields, { id: newId(), label: "", urlTemplate: "" }])}
      >
        <LuPlus /> Add field
      </Button>
    </Stack>
  );
}

function DraftBody(props: { draft: Draft; onChange: (d: Draft) => void }) {
  const { draft, onChange } = props;
  const { widget } = draft;
  switch (widget.is) {
    case "bookmarks":
      return (
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
            value={draft.outline}
            placeholder="Mail | https://mail.example.com
Work
  Repo | https://git.example.com"
            onChange={(e) => onChange({ ...draft, outline: e.target.value })}
            onKeyDown={(e) => {
              // Let Tab indent instead of moving focus.
              if (e.key !== "Tab") return;
              e.preventDefault();
              const t = e.currentTarget;
              const at = t.selectionStart;
              const outline = draft.outline.slice(0, at) + "  " +
                draft.outline.slice(t.selectionEnd);
              onChange({ ...draft, outline });
              requestAnimationFrame(() => t.setSelectionRange(at + 2, at + 2));
            }}
          />
        </Box>
      );
    case "snippets":
      return <SnippetsEditor widget={widget} onChange={(w) => onChange({ ...draft, widget: w })} />;
    case "form-grid":
      return <FormGridEditor widget={widget} onChange={(w) => onChange({ ...draft, widget: w })} />;
    case "assistant":
      return (
        <Text fontSize="sm" color="fg.muted">
          A chat with the admin assistant, always on view. It's the same conversation as the
          assistant in the admin bar.
        </Text>
      );
    case "mfe":
      return (
        <Text fontSize="sm" color="fg.muted">
          A "{widget.mfe}" widget. Its settings can't be edited here yet.
        </Text>
      );
    default:
      return widget satisfies never;
  }
}

/** Edits one widget's draft: its subheading and its kind-specific contents. */
export function WidgetForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  error: string | null;
}) {
  const { draft, onChange } = props;
  return (
    <Stack gap="4">
      <Box>
        <Label>Subheading</Label>
        <Input
          size="sm"
          value={draft.widget.subheading}
          onChange={(e) =>
            onChange({ ...draft, widget: { ...draft.widget, subheading: e.target.value } })}
        />
      </Box>
      <DraftBody draft={draft} onChange={onChange} />
      {props.error !== null && <Text color="fg.error" fontSize="sm">{props.error}</Text>}
    </Stack>
  );
}
