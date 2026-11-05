/** The snippets widget: text to copy with a click, whole or a character at a time. */
import { registerMfe } from "../../mfe/register-live.tsx";
import { editorView, widgetView } from "../../widget-kit/views.tsx";
import { SnippetsConfig } from "./config.ts";
import { SnippetsEditor } from "./editor.tsx";
import { Snippets } from "./snippets.tsx";

registerMfe("snippets", () => ({
  widget: widgetView(SnippetsConfig, Snippets),
  editor: editorView(SnippetsConfig, SnippetsEditor),
}));
