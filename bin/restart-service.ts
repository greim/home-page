#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env --allow-sys=uid --allow-net=127.0.0.1
/**
 * Restarts the installed launchd services (both, or the ones named), then waits
 * until each takes connections again, so the page can be reloaded right away.
 * Exits non-zero if one doesn't come back.
 *
 *   deno task restart-service             # the main server and the assistant service
 *   deno task restart-service app         # just the main server
 *   deno task restart-service assistant   # just the assistant service
 */
import { Effect } from "effect";
import { config } from "../src/server/config.ts";
import { executePlan } from "../tooling/plan-live.ts";
import { parseServiceNames, restartPlan, type ServiceName } from "../tooling/service-plan.ts";
import { awaitServices, WaitIo } from "../tooling/service-wait.ts";
import { liveWaitIo } from "../tooling/service-wait-live.ts";

const parsed = parseServiceNames(Deno.args);
if (!parsed.ok) {
  console.error(parsed.message);
  Deno.exit(2);
}
await executePlan(restartPlan(Deno.uid() ?? 0, parsed.names));

const services = {
  app: { name: "server", port: config.port, log: `${config.logsDir}/server.log` },
  assistant: {
    name: "assistant service",
    port: config.assistant.port,
    log: `${config.logsDir}/assistant.log`,
  },
} satisfies Record<ServiceName, unknown>;

const back = await Effect.runPromise(
  awaitServices(parsed.names.map((name) => services[name])).pipe(
    Effect.provideService(WaitIo, liveWaitIo),
  ),
);
if (back) console.log(`\nReady. Reload ${config.appUrl}`);
Deno.exit(back ? 0 : 1);
