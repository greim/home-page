/**
 * A button for the row under a `TextBox`: solid black with white text, the same in
 * every column and in light or dark mode. Takes a Chakra Button's props.
 */
import { Button, type ButtonProps } from "@chakra-ui/react";

export function TextBoxButton(props: ButtonProps) {
  return (
    <Button
      size="sm"
      variant="solid"
      bg="black"
      color="white"
      borderWidth="0"
      _hover={{ bg: "gray.800" }}
      _disabled={{ opacity: 0.4, cursor: "default" }}
      {...props}
    />
  );
}
