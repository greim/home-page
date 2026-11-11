/** Formatted content: an HTML tree from `formattedTree`, rendered as React elements. */
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useMemo } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { formattedContent } from "./styles.ts";

export function Formatted({ tree, ...props }: { tree: Root } & HTMLChakraProps<"div">) {
  const content = useMemo(() => toJsxRuntime(tree, { Fragment, jsx, jsxs }), [tree]);
  return <chakra.div css={formattedContent} {...props}>{content}</chakra.div>;
}
