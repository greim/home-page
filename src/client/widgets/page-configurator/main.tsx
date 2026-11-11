/**
 * The page configurator widget: a button in its column, and a full-screen chat where
 * its agent ("configure": the layout, its own tools, and the web after asking) changes
 * the page as the user asks, for the user to apply.
 */
import { Box, Input, NativeSelect, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { selectableModels } from "../../../common/agent-models.ts";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import {
  type EditorProps,
  editorView,
  fullScreenView,
  widgetView,
} from "../../widget-kit/views.tsx";
import { PageConfiguratorConfig } from "./config.ts";
import { PageConfigurator, PageConfiguratorFullScreen } from "./page-configurator.tsx";

function Editor({ config, reportDraft }: EditorProps<PageConfiguratorConfig>) {
  const [draft, setDraft] = useState(config);
  useEffect(() => reportDraft({ ok: true, config }), []);
  const update = (next: PageConfiguratorConfig) => {
    setDraft(next);
    reportDraft({ ok: true, config: next });
  };
  return (
    <Stack gap="4">
      <Box>
        <Label>Heading</Label>
        <Input
          size="sm"
          value={draft.heading}
          placeholder="None"
          onChange={(e) => update({ ...draft, heading: e.target.value })}
        />
      </Box>
      <Box>
        <Label>Model</Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={draft.model}
            onChange={(e) => update({ ...draft, model: e.target.value })}
          >
            {selectableModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Box>
    </Stack>
  );
}

registerMfe("page-configurator", () => ({
  widget: widgetView(PageConfiguratorConfig, PageConfigurator),
  editor: editorView(PageConfiguratorConfig, Editor),
  "full-screen": fullScreenView(PageConfiguratorConfig, PageConfiguratorFullScreen),
}));
