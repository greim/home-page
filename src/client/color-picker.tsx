import { chakra, HStack, SimpleGrid, Text } from "@chakra-ui/react";
import { columnColorPresets } from "./surface.ts";

const swatch = {
  borderWidth: "1px",
  borderColor: "border.emphasized",
  rounded: "full",
  cursor: "pointer",
} as const;

/** A row of preset swatches plus a custom color input. */
export function ColorPicker(props: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <HStack gap="2" wrap="wrap" role="group" aria-label={props.label}>
      <SimpleGrid columns={columnColorPresets.length} gap="2">
        {columnColorPresets.map((color) => (
          <chakra.button
            key={color}
            {...swatch}
            boxSize="7"
            bg={color}
            aria-label={color}
            aria-pressed={color === props.value}
            outline={color === props.value ? "2px solid" : "none"}
            outlineColor="colorPalette.solid"
            outlineOffset="2px"
            onClick={() => props.onChange(color)}
          />
        ))}
      </SimpleGrid>
      <HStack as="label" gap="2" cursor="pointer" ms="2">
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
    </HStack>
  );
}
