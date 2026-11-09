/**
 * The spreadsheet fixer widget: a button in its column, and a full-screen view where
 * its agent ("fix", with tools of its own in agent-tools.ts) fixes a CSV.
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
import { SpreadsheetFixerConfig } from "./config.ts";
import { SpreadsheetFixer, SpreadsheetFixerFullScreen } from "./spreadsheet-fixer.tsx";

function Editor({ config, reportDraft }: EditorProps<SpreadsheetFixerConfig>) {
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

registerMfe("spreadsheet-fixer", () => ({
  widget: widgetView(SpreadsheetFixerConfig, SpreadsheetFixer),
  editor: editorView(SpreadsheetFixerConfig, Editor),
  "full-screen": fullScreenView(SpreadsheetFixerConfig, SpreadsheetFixerFullScreen),
}));
