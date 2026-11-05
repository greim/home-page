import { defineManifest } from "../../../common/widgets.ts";
import { ClockConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Clock",
  description: "Shows the current time and date, in the computer's time zone or a chosen one.",
  config: ClockConfig,
  defaultConfig: { timeZone: null },
});
