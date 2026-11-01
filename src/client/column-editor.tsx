import {
  Box,
  Button,
  Center,
  chakra,
  CloseButton,
  Dialog,
  Grid,
  HStack,
  IconButton,
  Input,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuArrowRightLeft, LuGripVertical, LuPlus, LuTrash2 } from "react-icons/lu";
import { gapToIndex } from "../common/arrays.ts";
import type { LayoutAction } from "../common/layout-ops.ts";
import { type Column, newWidget, widgetKinds } from "../common/model.ts";
import { action, ActionMenu } from "./admin-menu.tsx";
import { ColorPicker } from "./color-picker.tsx";
import {
  addWidget,
  type ColumnDraft,
  finishColumnDraft,
  moveWidget,
  removeWidget,
  selectedDraft,
  selectWidget,
  sendWidget,
  toColumnDraft,
  updateWidget,
} from "./column-draft.ts";
import { IconPicker, NamedIcon } from "./icon-picker.tsx";
import { Label, WidgetForm } from "./widget-editor.tsx";
import type { Draft } from "./widget-draft.ts";

const newId = () => crypto.randomUUID();

const kindName = (draft: Draft): string =>
  widgetKinds.find((k) => k.is === draft.widget.is)?.name ?? draft.widget.is;

/** Drawn just above or below a list row to show where a dragged widget will land. */
const dropLine = (side: "top" | "bottom") =>
  `0 ${side === "top" ? "-2px" : "2px"} 0 0 {colors.colorPalette.solid}`;

/** The heading, icon and background color across the top of the editor. */
function ColumnFields(props: { draft: ColumnDraft; onChange: (draft: ColumnDraft) => void }) {
  const { draft, onChange } = props;
  return (
    <HStack gap="5" align="end" wrap="wrap">
      <Box>
        <Label>Icon</Label>
        <IconPicker
          portalled={false}
          value={draft.icon}
          onChange={(icon) => onChange({ ...draft, icon })}
        >
          <IconButton aria-label="Change column icon" variant="outline" size="sm">
            <NamedIcon name={draft.icon} boxSize="5" />
          </IconButton>
        </IconPicker>
      </Box>
      <Box flex="1" minW="48">
        <Label>Heading</Label>
        <Input
          size="sm"
          value={draft.heading}
          onChange={(e) => onChange({ ...draft, heading: e.target.value })}
        />
      </Box>
      <Box>
        <Label>Background</Label>
        <ColorPicker
          label="Column background color"
          value={draft.color}
          onChange={(color) => onChange({ ...draft, color })}
        />
      </Box>
    </HStack>
  );
}

/**
 * The column's widgets: click one to edit it, drag (or use the arrow keys on its
 * grip) to reorder, send it to another column, or delete it.
 */
function WidgetList(props: {
  draft: ColumnDraft;
  otherColumns: ReadonlyArray<Column>;
  onChange: (draft: ColumnDraft) => void;
}) {
  const { draft, onChange } = props;
  // The widget being dragged, and the gap (0 = before the first) it would drop into.
  const [drag, setDrag] = useState<{ id: string; from: number; gap: number | null } | null>(
    null,
  );
  const count = draft.widgets.length;

  return (
    <Stack gap="1">
      {draft.widgets.map((w, i) => {
        const id = w.widget.id;
        const name = w.widget.subheading || "Untitled";
        const selected = draft.selectedId === id;
        const shadow = drag?.gap === i
          ? dropLine("top")
          : drag?.gap === count && i === count - 1
          ? dropLine("bottom")
          : undefined;
        return (
          <HStack
            key={id}
            gap="1"
            px="1"
            py="1"
            rounded="md"
            bg={selected ? "colorPalette.subtle" : undefined}
            _hover={{ bg: selected ? "colorPalette.subtle" : "bg.muted" }}
            boxShadow={shadow}
            opacity={drag?.id === id ? 0.5 : 1}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", name);
              setDrag({ id, from: i, gap: null });
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const gap = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
              if (gap !== drag.gap) setDrag({ ...drag, gap });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null && drag.gap !== null) {
                onChange(moveWidget(draft, drag.id, gapToIndex(drag.from, drag.gap)));
              }
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
          >
            <chakra.button
              display="flex"
              color="fg.muted"
              cursor="grab"
              rounded="sm"
              aria-label={`Reorder ${name} (drag, or use arrow keys)`}
              title="Drag to reorder"
              onKeyDown={(e) => {
                const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                if (delta === 0) return;
                e.preventDefault();
                onChange(moveWidget(draft, id, Math.max(0, i + delta)));
              }}
            >
              <LuGripVertical />
            </chakra.button>
            <chakra.button
              flex="1"
              minW="0"
              textAlign="start"
              cursor="pointer"
              aria-pressed={selected}
              onClick={() => onChange(selectWidget(draft, id))}
            >
              <Text fontSize="sm" fontWeight="medium" truncate>{name}</Text>
              <Text fontSize="xs" color="fg.muted" truncate>{kindName(w)}</Text>
            </chakra.button>
            <ActionMenu
              label={`Send ${name} to another column`}
              portalled={false}
              actions={props.otherColumns.map((c) =>
                action(c.id, c.heading || "Untitled", () => onChange(sendWidget(draft, id, c.id)))
              )}
              trigger={
                <IconButton
                  aria-label={`Send ${name} to another column`}
                  title="Send to another column"
                  size="2xs"
                  variant="ghost"
                  disabled={props.otherColumns.length === 0}
                >
                  <LuArrowRightLeft />
                </IconButton>
              }
            />
            <IconButton
              aria-label={`Delete ${name}`}
              title="Delete"
              size="2xs"
              variant="ghost"
              onClick={() => onChange(removeWidget(draft, id))}
            >
              <LuTrash2 />
            </IconButton>
          </HStack>
        );
      })}
      {count === 0 && <Text fontSize="sm" color="fg.muted" px="1">No widgets yet.</Text>}
      <Box mt="2">
        <ActionMenu
          label="Add widget"
          portalled={false}
          actions={widgetKinds.map((kind) =>
            action(
              kind.is,
              kind.name,
              () => onChange(addWidget(draft, newWidget(kind.is, newId()))),
            )
          )}
          trigger={
            <Button size="sm" variant="ghost" px="2">
              <LuPlus /> Add widget
            </Button>
          }
        />
      </Box>
    </Stack>
  );
}

/**
 * A dialog for editing one column: its attributes across the top, its widgets
 * listed on the left, and the selected widget's editor on the right. Changes are
 * drafted, and applied together on Save.
 */
export function ColumnEditor(props: {
  column: Column;
  /** Every column in the layout, for sending widgets elsewhere. */
  columns: ReadonlyArray<Column>;
  /** The widget to start with selected, if any. */
  widgetId: string | null;
  onSave: (action: LayoutAction) => void;
  onClose: () => void;
}) {
  const { column } = props;
  const [draft, setDraft] = useState(() => toColumnDraft(column, props.widgetId));
  const [error, setError] = useState<{ widgetId: string; message: string } | null>(null);
  const selected = selectedDraft(draft);

  const save = () => {
    const finished = finishColumnDraft(column, draft, newId);
    if (finished.ok) {
      props.onSave(finished.action);
      return;
    }
    setError({ widgetId: finished.widgetId, message: finished.errorMessage });
    setDraft(selectWidget(draft, finished.widgetId));
  };

  return (
    <Dialog.Root
      open
      size="cover"
      closeOnInteractOutside={false}
      onOpenChange={(e) => !e.open && props.onClose()}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="6xl">
            <Dialog.Header>
              <Dialog.Title>Edit column</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="5" minH="0">
              <ColumnFields draft={draft} onChange={setDraft} />
              <Grid templateColumns="18rem 1fr" gap="5" flex="1" minH="0">
                <Box borderWidth="1px" rounded="md" p="2" overflowY="auto">
                  <WidgetList
                    draft={draft}
                    otherColumns={props.columns.filter((c) => c.id !== column.id)}
                    onChange={setDraft}
                  />
                </Box>
                <Box borderWidth="1px" rounded="md" p="4" overflowY="auto">
                  {selected === undefined
                    ? (
                      <Center h="full">
                        <Text color="fg.muted">Select a widget to edit</Text>
                      </Center>
                    )
                    : (
                      <WidgetForm
                        key={selected.widget.id}
                        draft={selected}
                        onChange={(w) => setDraft(updateWidget(draft, w))}
                        error={error?.widgetId === selected.widget.id ? error.message : null}
                      />
                    )}
                </Box>
              </Grid>
            </Dialog.Body>
            <Dialog.Footer>
              {error !== null && error.widgetId !== selected?.widget.id && (
                <Text color="fg.error" fontSize="sm" me="auto">{error.message}</Text>
              )}
              <Button variant="outline" onClick={props.onClose}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
