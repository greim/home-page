/**
 * Serves the agent-runs widget API (src/common/apis/agent-runs.ts) from the
 * assistant service's runs (`WidgetAgentRuns`, in widget-agents.ts).
 */
import { Effect } from "effect";
import { agentRunsApi } from "../common/apis/agent-runs.ts";
import type { HttpResponse } from "./http.ts";
import { text } from "./http.ts";
import { serve, type ServedApi } from "./widget-api-routes.ts";
import { WidgetAgentRuns } from "./widget-agents.ts";

const noSuchRun = {
  ok: false,
  error: { is: "no-such-run", message: "There's no such run (it may have ended a while ago)." },
} as const;

/** A file's download, named as the agent named it. */
const download = (name: string, bytes: Uint8Array): HttpResponse => ({
  status: 200,
  headers: {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="${name.replaceAll('"', "")}"`,
    "cache-control": "no-store",
  },
  body: new Uint8Array(bytes),
});

export const agentRunsServed: ServedApi<WidgetAgentRuns> = serve<
  typeof agentRunsApi,
  WidgetAgentRuns
>(agentRunsApi, {
  run: ({ agent, input, model }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.runToEnd(caller, agent, input, model), (outcome) =>
          outcome.ok
            ? { ok: true, value: { output: outcome.output, costUsd: outcome.costUsd } } as const
            // 502s are the agent's own failures; anything else kept it from starting.
            : {
              ok: false,
              error: {
                is: outcome.status === 502 ? "agent-failed" : "not-started",
                message: outcome.message,
              },
            } as const),
    ),
  start: ({ agent, input, files, model }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.start(caller, agent, { input, files, model }), (started) =>
          started.ok
            ? { ok: true, value: { runId: started.runId } } as const
            : { ok: false, error: { is: "not-started", message: started.message } } as const),
    ),
  events: ({ runId, after }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.events(caller, runId, after), (events) =>
          events === null ? noSuchRun : { ok: true, value: events } as const),
    ),
  answer: ({ runId, askId, allow, forRun }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.answer(caller, runId, askId, { allow, forRun }), (answered) =>
          answered === null ? noSuchRun : answered ? { ok: true, value: null } as const : {
            ok: false,
            error: { is: "not-waiting", message: "The run isn't waiting for that answer." },
          } as const),
    ),
  cancel: ({ runId }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.cancel(caller, runId), (cancelled) =>
          cancelled ? { ok: true, value: null } as const : noSuchRun),
    ),
  file: ({ runId, name }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.file(caller, runId, name), (bytes) =>
          bytes === null ? text(404, "There's no such file.") : download(name, bytes)),
    ),
  fileText: ({ runId, name }, caller) =>
    Effect.flatMap(
      WidgetAgentRuns,
      (runs) =>
        Effect.map(runs.file(caller, runId, name), (bytes) =>
          bytes === null
            ? {
              ok: false,
              error: { is: "no-such-file", message: `The run wrote no file named ${name}.` },
            } as const
            : { ok: true, value: { text: new TextDecoder().decode(bytes) } } as const),
    ),
});
