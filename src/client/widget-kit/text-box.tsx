/**
 * A text box for a widget's column, styled like the page's code boxes (`codeBox`):
 * monospace, on the hatched inset, in the column's text color. Takes a textarea's
 * props (a ref too), and Chakra's to adjust it.
 */
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import type { ComponentProps } from "react";
import { codeBox, fieldFocusOutline } from "../surface.ts";

/**
 * The box's look and size, for anything that stands in for a `TextBox` (such as a
 * preview of what's in it) and should look just the same.
 */
export const textBoxStyle = {
  css: codeBox,
  display: "block",
  w: "100%",
  minH: "10rem",
  resize: "vertical",
  // In rem, not em, so the box stays the same if its font size is changed.
  px: "0.425rem",
  py: "0.34rem",
  borderRadius: "0.2125rem",
  fontSize: "0.85rem",
  color: "inherit",
  border: "none",
  outline: "none",
  _focus: fieldFocusOutline,
} as const;

export function TextBox(
  props: HTMLChakraProps<"textarea"> & Pick<ComponentProps<"textarea">, "ref">,
) {
  return (
    <chakra.textarea
      {...textBoxStyle}
      fontFamily="mono"
      _placeholder={{ color: "inherit", opacity: 0.5 }}
      {...props}
    />
  );
}
