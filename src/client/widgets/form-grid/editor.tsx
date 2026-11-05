/** Edits the form grid: how many columns it has, and each field's label and URL template. */
import { Box, Button, HStack, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { mapWhere, removeWhere } from "../../../common/arrays.ts";
import { Label, RowControls } from "../../widget-kit/form.tsx";
import { nudge } from "../../widget-kit/rows.ts";
import type { EditorProps } from "../../widget-kit/views.tsx";
import { checkConfig, type FormField, type FormGridConfig, type GridColumns } from "./config.ts";
import { placeholder } from "./url-template.ts";

const newId = () => crypto.randomUUID();

export function FormGridEditor(props: EditorProps<FormGridConfig>) {
  const { reportDraft } = props;
  const [config, setConfigState] = useState(props.config);

  useEffect(() => reportDraft(checkConfig(props.config)), []);

  const setConfig = (next: FormGridConfig) => {
    setConfigState(next);
    reportDraft(checkConfig(next));
  };
  const setFields = (fields: ReadonlyArray<FormField>) => setConfig({ ...config, fields });

  return (
    <Stack gap="3">
      <Box>
        <Label>Grid columns</Label>
        <NativeSelect.Root size="sm" width="24">
          <NativeSelect.Field
            value={config.gridColumns}
            onChange={(e) =>
              setConfig({ ...config, gridColumns: Number(e.target.value) as GridColumns })}
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Box>
      <Text fontSize="xs" color="fg.muted">
        Each field opens its URL template in a new tab, with {placeholder}{" "}
        replaced by what you type.
      </Text>
      {config.fields.map((f) => {
        const update = (patch: Partial<FormField>) =>
          setFields(mapWhere(config.fields, (x) => x.id === f.id, (x) => ({ ...x, ...patch })));
        return (
          <HStack key={f.id}>
            <Input
              size="sm"
              width="40%"
              placeholder="Placeholder label"
              value={f.label}
              onChange={(e) => update({ label: e.target.value })}
            />
            <Input
              size="sm"
              fontFamily="mono"
              placeholder={`https://example.com/search?q=${placeholder}`}
              value={f.urlTemplate}
              onChange={(e) => update({ urlTemplate: e.target.value })}
            />
            <RowControls
              onUp={() => setFields(nudge(config.fields, f.id, -1))}
              onDown={() => setFields(nudge(config.fields, f.id, 1))}
              onRemove={() => setFields(removeWhere(config.fields, (x) => x.id === f.id))}
            />
          </HStack>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        alignSelf="start"
        onClick={() => setFields([...config.fields, { id: newId(), label: "", urlTemplate: "" }])}
      >
        <LuPlus /> Add field
      </Button>
    </Stack>
  );
}
