import { defineManifest } from "../../../common/widgets.ts";
import { WorkdayConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Workday",
  description:
    "A progress bar through the working week, following the user's start and end of day and their weekend days: how far through the workday, the hours after it, or the weekend it is.",
  config: WorkdayConfig,
  defaultConfig: {},
});
