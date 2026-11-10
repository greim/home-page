/**
 * The page configurator widget: a button in its column, and a full-screen chat where
 * its agent ("configure": the layout, its own tools, and the web after asking) changes
 * the page as the user asks, for the user to apply.
 */
import { Box, Input } from "@chakra-ui/react";
import { useEffect, useState } from "react";
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
  return (
    <Box>
      <Label>Heading</Label>
      <Input
        size="sm"
        value={draft.heading}
        placeholder="None"
        onChange={(e) => {
          const next = { ...draft, heading: e.target.value };
          setDraft(next);
          reportDraft({ ok: true, config: next });
        }}
      />
    </Box>
  );
}

registerMfe("page-configurator", () => ({
  widget: widgetView(PageConfiguratorConfig, PageConfigurator),
  editor: editorView(PageConfiguratorConfig, Editor),
  "full-screen": fullScreenView(PageConfiguratorConfig, PageConfiguratorFullScreen),
}));
