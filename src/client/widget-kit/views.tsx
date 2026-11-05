/**
 * Wraps a widget's components as MFE views: decodes their props, and renders
 * them with Chakra set up as the shell has it. Colors, fonts and the skin's
 * variables are inherited from where the shell embeds them.
 */
import { ChakraProvider, Text } from "@chakra-ui/react";
import { Either, type Schema } from "effect";
import type { ComponentType, JSX } from "react";
import { makeSystem } from "../chakra-system.ts";
import type { View, ViewProps } from "../mfe/register-live.tsx";
import {
  decodeEditorProps,
  decodeWidgetProps,
  type EditorProps,
  type WidgetProps,
} from "./decode.ts";

export type { Draft, EditorProps, WidgetProps } from "./decode.ts";

const system = makeSystem();

const Problem = (props: { message: string }) => (
  <Text fontSize="sm" color="fg.error">{props.message}</Text>
);

/**
 * Any other view a widget provides, given its props as `decode` makes them
 * (e.g. the assistant's panel in the admin bar).
 */
export const customView = <P,>(
  decode: (props: unknown) => Either.Either<P, string>,
  Component: ComponentType<P>,
): View =>
({ props }: ViewProps) => {
  const decoded = decode(props);
  return (
    <ChakraProvider value={system}>
      {Either.isLeft(decoded)
        ? <Problem message={decoded.left} />
        : <Component {...(decoded.right as P & JSX.IntrinsicAttributes)} />}
    </ChakraProvider>
  );
};

/** The view shown in a column, given its config decoded with `schema`. */
export const widgetView = <A, I>(
  schema: Schema.Schema<A, I>,
  Component: ComponentType<WidgetProps<A>>,
): View => customView((props) => decodeWidgetProps(schema, props), Component);

/** The settings form shown in the column editor. */
export const editorView = <A, I>(
  schema: Schema.Schema<A, I>,
  Component: ComponentType<EditorProps<A>>,
): View => customView((props) => decodeEditorProps(schema, props), Component);
