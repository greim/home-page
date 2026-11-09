/**
 * The web researcher widget: a button in its column, and a full-screen view where its
 * agent ("research": web search on its own, reading pages after asking) writes a report.
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
import { WebResearcherConfig } from "./config.ts";
import { WebResearcher, WebResearcherFullScreen } from "./web-researcher.tsx";

function Editor({ config, reportDraft }: EditorProps<WebResearcherConfig>) {
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

registerMfe("web-researcher", () => ({
  widget: widgetView(WebResearcherConfig, WebResearcher),
  editor: editorView(WebResearcherConfig, Editor),
  "full-screen": fullScreenView(WebResearcherConfig, WebResearcherFullScreen),
}));
