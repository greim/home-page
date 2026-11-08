/** The paste-as-Markdown widget: paste formatted text, get Markdown to copy. */
import { Box, Input } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import { type EditorProps, editorView, widgetView } from "../../widget-kit/views.tsx";
import { PasteMarkdownConfig } from "./config.ts";
import { PasteMarkdown } from "./paste-markdown.tsx";

function PasteMarkdownEditor(props: EditorProps<PasteMarkdownConfig>) {
  const { reportDraft } = props;
  const [heading, setHeading] = useState(props.config.heading);
  useEffect(() => reportDraft({ ok: true, config: props.config }), []);
  return (
    <Box>
      <Label>Heading</Label>
      <Input
        size="sm"
        value={heading}
        placeholder="None"
        onChange={(e) => {
          setHeading(e.target.value);
          reportDraft({ ok: true, config: { heading: e.target.value } });
        }}
      />
    </Box>
  );
}

registerMfe("paste-markdown", () => ({
  widget: widgetView(PasteMarkdownConfig, PasteMarkdown),
  editor: editorView(PasteMarkdownConfig, PasteMarkdownEditor),
}));
