#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/** Stops the launchd user agent and removes it. */
import { executePlan } from "../tooling/plan-live.ts";
import { uninstallPlan } from "../tooling/service-plan.ts";

await executePlan(uninstallPlan({
  uid: Deno.uid() ?? 0,
  home: Deno.env.get("HOME") ?? "",
}));
