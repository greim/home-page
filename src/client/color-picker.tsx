import { chakra, HStack, Popover, Portal, SimpleGrid, Text } from "@chakra-ui/react";
import { columnColorPresets } from "./surface.ts";

const swatch = {
  borderWidth: "1px",
  borderColor: "border.emphasized",
  rounded: "full",
  cursor: "pointer",
} as const;

/** A swatch button that opens a palette of presets plus a custom color input. */
export function ColorPicker(props: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Popover.Root positioning={{ placement: "bottom-end" }}>
      <Popover.Trigger asChild>
        <chakra.button
          {...swatch}
          boxSize="4"
          flexShrink="0"
          bg={props.value}
          aria-label={props.label}
          title={props.label}
        />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="auto">
            <Popover.Body p="3">
              <SimpleGrid columns={5} gap="2">
                {columnColorPresets.map((color) => (
                  <chakra.button
                    key={color}
                    {...swatch}
                    boxSize="7"
                    bg={color}
                    aria-label={color}
                    outline={color === props.value ? "2px solid" : "none"}
                    outlineColor="colorPalette.solid"
                    outlineOffset="2px"
                    onClick={() => props.onChange(color)}
                  />
                ))}
              </SimpleGrid>
              <HStack as="label" mt="3" gap="2" cursor="pointer">
                <chakra.input
                  type="color"
                  value={props.value}
                  onChange={(e) => props.onChange(e.target.value)}
                  boxSize="7"
                  p="0"
                  borderWidth="0"
                  bg="transparent"
                  cursor="pointer"
                />
                <Text fontSize="sm">Custom…</Text>
              </HStack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
