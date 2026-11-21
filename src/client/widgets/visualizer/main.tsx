/**
 * The visualizer widget: a box in its column to paste data into, which its agent
 * ("visualize", with tools of its own in agent-tools.ts) charts; and a full-screen
 * view to browse, delete and refine the charts.
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
import { VisualizerConfig } from "./config.ts";
import { VisualizerFullScreen } from "./full-screen.tsx";
import { Visualizer } from "./visualizer.tsx";

function Editor({ config, reportDraft }: EditorProps<VisualizerConfig>) {
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

registerMfe("visualizer", () => ({
  widget: widgetView(VisualizerConfig, Visualizer),
  editor: editorView(VisualizerConfig, Editor),
  "full-screen": fullScreenView(VisualizerConfig, VisualizerFullScreen),
}));
