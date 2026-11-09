/**
 * The grammar check widget: a button in its column, and a full-screen view where
 * Claude (its "check" agent, declared in its manifest) checks a block of text.
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
import { GrammarCheckConfig } from "./config.ts";
import { GrammarCheck, GrammarCheckFullScreen } from "./grammar-check.tsx";

function GrammarCheckEditor({ config, reportDraft }: EditorProps<GrammarCheckConfig>) {
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

registerMfe("grammar-check", () => ({
  widget: widgetView(GrammarCheckConfig, GrammarCheck),
  editor: editorView(GrammarCheckConfig, GrammarCheckEditor),
  "full-screen": fullScreenView(GrammarCheckConfig, GrammarCheckFullScreen),
}));
