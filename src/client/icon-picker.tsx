import { chakra, Icon, Input, Popover, Portal, SimpleGrid, Text } from "@chakra-ui/react";
import { type ReactElement, useState } from "react";
import { searchIcons } from "./column-icons.ts";
import { allIcons, iconFor } from "./icon-set.ts";

/** Draws a named icon (see icon-set.ts) at the surrounding text's color. */
export function NamedIcon(props: { name: string; boxSize: string }) {
  const Glyph = iconFor(props.name);
  return (
    <Icon boxSize={props.boxSize} flexShrink="0">
      <Glyph />
    </Icon>
  );
}

/**
 * Opens a searchable grid of every available icon when `children` (the trigger,
 * a single element that accepts a ref and click handler) is clicked. Picking one
 * closes the grid, as do Escape and a click outside it (which does nothing else).
 */
export function IconPicker(props: {
  /** False inside a dialog, which the grid must render within to appear above it. */
  portalled: boolean;
  value: string;
  onChange: (name: string) => void;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = searchIcons(allIcons, query);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open);
        setQuery("");
      }}
      positioning={{ placement: "bottom-start" }}
      // Blocks pointer events outside the grid, so a click off it only closes it
      // rather than also activating whatever link or button was under the pointer.
      modal
      lazyMount
      unmountOnExit
      initialFocusEl={() => document.getElementById("icon-picker-search")}
    >
      <Popover.Trigger asChild>{props.children}</Popover.Trigger>
      <Portal disabled={!props.portalled}>
        <Popover.Positioner>
          <Popover.Content width="sm">
            <Popover.Body p="3">
              <Input
                id="icon-picker-search"
                size="sm"
                placeholder={`Search ${allIcons.length} icons…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <SimpleGrid columns={8} gap="1" mt="3" maxH="xs" overflowY="auto">
                {matches.map((entry) => (
                  <chakra.button
                    key={entry.name}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    aspectRatio="1"
                    rounded="md"
                    cursor="pointer"
                    _hover={{ bg: "bg.muted" }}
                    bg={entry.name === props.value ? "colorPalette.subtle" : undefined}
                    aria-label={entry.label}
                    title={entry.label}
                    onClick={() => {
                      props.onChange(entry.name);
                      setOpen(false);
                    }}
                  >
                    <NamedIcon name={entry.name} boxSize="5" />
                  </chakra.button>
                ))}
              </SimpleGrid>
              {matches.length === 0 && (
                <Text fontSize="sm" color="fg.muted" mt="2">No icons match “{query}”.</Text>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
