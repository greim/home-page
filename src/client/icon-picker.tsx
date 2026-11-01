import { chakra, Icon, Input, Popover, Portal, SimpleGrid, Text } from "@chakra-ui/react";
import { useState } from "react";
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
 * A button showing the current icon, which opens a searchable grid of every
 * available icon. Picking one closes the grid.
 */
export function IconPicker(props: {
  label: string;
  value: string;
  boxSize: string;
  onChange: (name: string) => void;
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
      lazyMount
      unmountOnExit
      initialFocusEl={() => document.getElementById("icon-picker-search")}
    >
      <Popover.Trigger asChild>
        <chakra.button
          display="flex"
          flexShrink="0"
          rounded="md"
          cursor="pointer"
          _hover={{ color: "fg" }}
          aria-label={props.label}
          title={props.label}
        >
          <NamedIcon name={props.value} boxSize={props.boxSize} />
        </chakra.button>
      </Popover.Trigger>
      <Portal>
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
