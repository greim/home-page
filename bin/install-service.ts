#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Installs the webserver as a launchd user agent that starts at login and is
 * restarted automatically if it ever exits. Safe to re-run (reinstalls).
 */
import { config } from "../src/server/config.ts";
import { executePlan } from "../tooling/plan-live.ts";
import { installPlan } from "../tooling/service-plan.ts";

await executePlan(installPlan({
  uid: Deno.uid() ?? 0,
  home: Deno.env.get("HOME") ?? "",
  denoPath: Deno.execPath(),
  repoRoot: config.repoRoot,
  serverEntry: config.serverEntry,
  logsDir: config.logsDir,
  dataDir: config.dataDir,
}));
console.log(`\nInstalled. Logs: ${config.logsDir}/server.log`);
console.log(`Visit ${config.appUrl}`);
