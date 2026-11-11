/**
 * The textualizer widget: paste text in, see it formatted, copy it out in another
 * form, and check its grammar full screen.
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
import { TextualizerConfig } from "./config.ts";
import { TextualizerFullScreen } from "./full-screen.tsx";
import { Textualizer } from "./textualizer.tsx";

function TextualizerEditor({ config, reportDraft }: EditorProps<TextualizerConfig>) {
  const [draft, setDraft] = useState(config);
  // Report on open too, even with nothing changed, or Save can't apply it.
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

registerMfe("textualizer", () => ({
  widget: widgetView(TextualizerConfig, Textualizer),
  editor: editorView(TextualizerConfig, TextualizerEditor),
  "full-screen": fullScreenView(TextualizerConfig, TextualizerFullScreen),
}));
