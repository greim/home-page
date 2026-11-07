#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Installs the main server and the assistant service as launchd user agents
 * that start at login and are restarted automatically if they ever exit. Safe
 * to re-run (reinstalls).
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
  assistantEntry: config.assistant.entry,
  logsDir: config.logsDir,
  dataDir: config.dataDir,
  path: Deno.env.get("PATH") ?? "/usr/bin:/bin:/usr/sbin:/sbin",
}));
console.log(`\nInstalled. Logs: ${config.logsDir}/server.log and ${config.logsDir}/assistant.log`);
console.log(`Visit ${config.appUrl}`);
