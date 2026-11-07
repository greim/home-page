import { defineManifest } from "../../../common/widgets.ts";
import { SnippetsConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Copyable Snippets",
  description:
    "Labeled pieces of text in monospace, such as shell commands or special characters, under an optional heading. Each copies whole when clicked, or copies just the character clicked.",
  config: SnippetsConfig,
  defaultConfig: { heading: "Snippets", snippets: [] },
});
