/**
 * The "Export" popover: a Copy / Save toggle over one list of formats. Which of the two was
 * last chosen is remembered in this browser (and shared by every widget that exports).
 */
import { Box, Button, Popover, Portal, SegmentGroup } from "@chakra-ui/react";
import { type ReactElement, useRef, useState } from "react";

export type ExportAction = "copy" | "save";

const actions: ReadonlyArray<{ value: ExportAction; label: string }> = [
  { value: "copy", label: "Copy" },
  { value: "save", label: "Save" },
];

const storageKey = "export:action";

const lastAction = (): ExportAction => {
  try {
    return localStorage.getItem(storageKey) === "save" ? "save" : "copy";
  } catch {
    return "copy";
  }
};

const keepAction = (action: ExportAction): void => {
  try {
    localStorage.setItem(storageKey, action);
  } catch {
    // Not kept: it lasts until the page reloads.
  }
};

/** The popover, opened by `trigger` (a button). */
export function ExportPopover<Format extends string>(props: {
  trigger: ReactElement;
  formats: ReadonlyArray<{ readonly value: Format; readonly label: string }>;
  onExport: (action: ExportAction, format: Format, from: Element) => void;
  /** Out of the column, so it isn't clipped; not in a full-screen view, which may be torn off. */
  portalled: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ExportAction>(lastAction);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      positioning={{ placement: "bottom-start" }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger ref={trigger} asChild>{props.trigger}</Popover.Trigger>
      <Portal disabled={!props.portalled}>
        <Popover.Positioner>
          <Popover.Content width="auto" minW="10rem" p="0.5rem">
            <SegmentGroup.Root
              size="sm"
              width="100%"
              value={action}
              onValueChange={(e) => {
                const next = actions.find((a) => a.value === e.value);
                if (next === undefined) return;
                setAction(next.value);
                keepAction(next.value);
              }}
            >
              <SegmentGroup.Indicator bg="black" />
              {actions.map((a) => (
                <SegmentGroup.Item
                  key={a.value}
                  value={a.value}
                  flex="1"
                  justifyContent="center"
                  color="fg.muted"
                  _checked={{ color: "white" }}
                  css={{ "&[data-state=checked]": { color: "white" } }}
                >
                  <SegmentGroup.ItemText>{a.label}</SegmentGroup.ItemText>
                  <SegmentGroup.ItemHiddenInput />
                </SegmentGroup.Item>
              ))}
            </SegmentGroup.Root>
            <Box mt="0.4rem" display="flex" flexDirection="column">
              {props.formats.map((format) => (
                <Button
                  key={format.value}
                  variant="ghost"
                  size="sm"
                  justifyContent="flex-start"
                  onClick={() => {
                    setOpen(false);
                    if (trigger.current !== null) {
                      props.onExport(action, format.value, trigger.current);
                    }
                  }}
                >
                  {format.label}
                </Button>
              ))}
            </Box>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
