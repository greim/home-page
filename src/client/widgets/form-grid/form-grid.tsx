import { chakra, Input, SimpleGrid, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { FormField, FormGridConfig } from "./config.ts";
import { fieldFocusOutline } from "../../surface.ts";
import { fillUrlTemplate } from "./url-template.ts";

function FieldForm(props: { field: FormField }) {
  const [error, setError] = useState<string | null>(null);
  return (
    // Flex, so the form is exactly as tall as its input (no inline baseline gap below it),
    // which keeps the grid's row gap the same as its column gap.
    <chakra.form
      display="flex"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        const filled = fillUrlTemplate(
          props.field.urlTemplate,
          typeof value === "string" ? value : "",
        );
        setError(filled.ok ? null : filled.errorMessage);
        if (filled.ok) {
          globalThis.open(filled.url, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <Input
        name="q"
        // White whatever the column's color, so the text and placeholder are fixed dark too.
        // Sunk into the column, and a little faded until focused.
        bg="white"
        color="gray.900"
        _placeholder={{ color: "gray.600" }}
        fontSize="1rem"
        lineHeight="1"
        h="auto"
        px="0.5em"
        py="0.4em"
        borderWidth="0"
        borderRadius="0.2em"
        boxShadow="-1px -1px 0 #000, 1px 1px 0 rgba(255, 255, 255, 0.25), 0.1em 0.1em 0.2em rgba(0, 0, 0, 0.2) inset"
        opacity={0.8}
        // The same outline as the column's text boxes, in place of Chakra's focus ring.
        outline="none"
        _focus={{ opacity: 1, ...fieldFocusOutline }}
        _focusVisible={fieldFocusOutline}
        textShadow="none"
        autoComplete="off"
        placeholder={props.field.label}
        aria-label={props.field.label}
        title={error ?? props.field.urlTemplate}
        aria-invalid={error !== null}
        onChange={() => setError(null)}
      />
    </chakra.form>
  );
}

export function FormGrid(props: WidgetProps<FormGridConfig>) {
  const { config } = props;
  if (config.fields.length === 0) {
    return <Text opacity={0.7}>No fields yet.</Text>;
  }
  return (
    <SimpleGrid columns={config.gridColumns} gap="1rem">
      {config.fields.map((field) => <FieldForm key={field.id} field={field} />)}
    </SimpleGrid>
  );
}
