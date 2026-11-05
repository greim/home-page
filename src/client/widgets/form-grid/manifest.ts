import { defineManifest } from "../../../common/widgets.ts";
import { FormGridConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Form Grid",
  description:
    "Single-line search fields in a grid of 1 to 4 columns. Pressing Enter in a field opens its URL template, with {query} replaced by what was typed, in a new tab.",
  config: FormGridConfig,
  defaultConfig: { gridColumns: 1, fields: [] },
});
