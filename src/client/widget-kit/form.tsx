/** Small pieces widget editors share, so they look alike. */
import { HStack, IconButton, Text } from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuTrash2 } from "react-icons/lu";

export function Label(props: { children: string }) {
  return <Text fontSize="sm" fontWeight="medium" mb="1">{props.children}</Text>;
}

/** Move up, move down and remove buttons for a row in a list. */
export function RowControls(props: {
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
