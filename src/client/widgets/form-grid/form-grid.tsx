import { chakra, Input, SimpleGrid, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { FormField, FormGridConfig } from "./config.ts";
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
        size="sm"
        // White whatever the column's color, so the text and placeholder are fixed dark too.
        bg="white"
        color="gray.900"
        _placeholder={{ color: "gray.500" }}
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
    return <Text fontSize="sm" color="fg.muted">No fields yet.</Text>;
  }
  return (
    <SimpleGrid columns={config.gridColumns} gap="3">
      {config.fields.map((field) => <FieldForm key={field.id} field={field} />)}
    </SimpleGrid>
  );
}
