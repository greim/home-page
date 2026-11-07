import { defineManifest } from "../../../common/widgets.ts";
import { ClockConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Clock",
  description:
    "Shows the local date and time, as 2026 / Nov / 6 / 3:28 pm, after a sun during the user's day or a moon outside it.",
  config: ClockConfig,
  defaultConfig: {},
});
