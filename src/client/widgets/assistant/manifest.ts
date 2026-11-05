import { defineManifest } from "../../../common/widgets.ts";
import { AssistantConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Assistant",
  description:
    "A chat with the admin assistant, always on view. Each assistant widget has a conversation of its own.",
  config: AssistantConfig,
  defaultConfig: {},
});
