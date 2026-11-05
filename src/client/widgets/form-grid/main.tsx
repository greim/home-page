/** The form grid widget: search fields that open a URL built from what's typed. */
import { registerMfe } from "../../mfe/register-live.tsx";
import { editorView, widgetView } from "../../widget-kit/views.tsx";
import { FormGridConfig } from "./config.ts";
import { FormGridEditor } from "./editor.tsx";
import { FormGrid } from "./form-grid.tsx";

registerMfe("form-grid", () => ({
  widget: widgetView(FormGridConfig, FormGrid),
  editor: editorView(FormGridConfig, FormGridEditor),
}));
