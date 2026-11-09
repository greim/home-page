/**
 * A text box for a widget's column, styled like the page's code boxes (`codeBox`):
 * monospace, on the hatched inset, in the column's text color. Takes a textarea's
 * props, and Chakra's to adjust it.
 */
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import { codeBox } from "../surface.ts";

export function TextBox(props: HTMLChakraProps<"textarea">) {
  return (
    <chakra.textarea
      css={codeBox}
      display="block"
      w="100%"
      minH="10rem"
      resize="vertical"
      px="0.5em"
      py="0.4em"
      fontFamily="mono"
      fontSize="0.85rem"
      color="inherit"
      border="none"
      outline="none"
      _focus={{ outline: "0.2rem solid #ffffff66" }}
      _placeholder={{ color: "inherit", opacity: 0.5 }}
      {...props}
    />
  );
}
