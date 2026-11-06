#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Installs the webserver as a launchd user agent that starts at login and is
 * restarted automatically if it ever exits. Safe to re-run (reinstalls).
 */
import { config } from "../src/server/config.ts";
import { executePlan } from "../tooling/plan-live.ts";
import { installPlan } from "../tooling/service-plan.ts";

/** claude as found on this shell's PATH, or "" if it isn't. */
async function whichClaude(): Promise<string> {
  try {
    const { success, stdout } = await new Deno.Command("which", { args: ["claude"] }).output();
    return success ? new TextDecoder().decode(stdout).trim() : "";
  } catch {
    return "";
  }
}

/**
 * `CLAUDE_PATH` if set, otherwise asks (Enter accepts the PATH lookup). launchd's minimal PATH
 * won't find claude, so the service is given its absolute path.
 */
async function claudePath(): Promise<string> {
  const fromEnv = Deno.env.get("CLAUDE_PATH");
  if (fromEnv) return fromEnv;
  const found = await whichClaude();
  const answer = prompt("Path to claude, for the admin assistant:", found)?.trim() || found;
  if (!answer.startsWith("/")) {
    console.error(`Need an absolute path to claude, got "${answer}". Set CLAUDE_PATH or retry.`);
    Deno.exit(1);
  }
  try {
    if (!Deno.statSync(answer).isFile) throw new Error();
  } catch {
    console.error(`No claude at ${answer}. Set CLAUDE_PATH or retry.`);
    Deno.exit(1);
  }
  return answer;
}

await executePlan(installPlan({
  uid: Deno.uid() ?? 0,
  home: Deno.env.get("HOME") ?? "",
  denoPath: Deno.execPath(),
  repoRoot: config.repoRoot,
  serverEntry: config.serverEntry,
  logsDir: config.logsDir,
  dataDir: config.dataDir,
  claudePath: await claudePath(),
}));
console.log(`\nInstalled. Logs: ${config.logsDir}/server.log`);
console.log(`Visit ${config.appUrl}`);
