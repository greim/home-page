/**
 * A widget agent's run, as the assistant service and the widget kit see it: started
 * with input (and files), it reports progress, may ask the user to allow something,
 * and ends with an answer (and files to download), a failure, or being cancelled.
 *
 *   POST /api/widget-agent-runs/{widget}/{agent}       start: `RunRequest`, answers `{ runId }`
 *   GET  /api/widget-agent-runs/{runId}/events?after=  the run's events, as NDJSON, from `after`
 *   POST /api/widget-agent-runs/{runId}/answers/{askId}  `AskAnswer`
 *   POST /api/widget-agent-runs/{runId}/cancel
 *   GET  /api/widget-agent-runs/{runId}/files/{name}   a file the agent wrote
 */
import { Schema } from "effect";

/** Where run routes are. Apart from the simple route (`/api/widget-agents/...`). */
export const runsPath = "/api/widget-agent-runs/";

/** A file given to a run, as base64. It's put in the run's `in/` folder. */
export const RunFile = Schema.Struct({
  name: Schema.String.pipe(
    Schema.pattern(/^[^/\\]+$/),
    Schema.filter((n) => n !== ".." && n !== "."),
  ),
  base64: Schema.String,
});
export type RunFile = typeof RunFile.Type;

export const RunRequest = Schema.Struct({
  input: Schema.Unknown.pipe(Schema.filter((input) => input !== undefined)),
  files: Schema.optionalWith(Schema.Array(RunFile), { default: () => [] }),
});
export type RunRequest = typeof RunRequest.Type;

export const AskAnswer = Schema.Struct({
  allow: Schema.Boolean,
  /** Allow the rest of this run's uses of the same capability without asking. */
  forRun: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});
export type AskAnswer = typeof AskAnswer.Type;

/** A file the agent wrote, in the run's `out/` folder. */
export const OutFile = Schema.Struct({ name: Schema.String, bytes: Schema.Number });
export type OutFile = typeof OutFile.Type;

export const RunEvent = Schema.Union(
  /** What the agent is doing, e.g. "Searching for ...". */
  Schema.Struct({ is: Schema.Literal("progress"), text: Schema.String }),
  /** It wants to do something that needs the user's say-so; the run waits. */
  Schema.Struct({
    is: Schema.Literal("ask"),
    askId: Schema.String,
    /** The capability, in plain words, e.g. "Reads web pages it chooses". */
    capability: Schema.String,
    /** What exactly, e.g. "Read a web page". */
    action: Schema.String,
    /** Its details, e.g. the URL. */
    detail: Schema.String,
  }),
  Schema.Struct({ is: Schema.Literal("answered"), askId: Schema.String, allow: Schema.Boolean }),
  Schema.Struct({
    is: Schema.Literal("done"),
    output: Schema.Unknown,
    costUsd: Schema.Number,
    files: Schema.Array(OutFile),
  }),
  Schema.Struct({ is: Schema.Literal("failed"), message: Schema.String }),
  Schema.Struct({ is: Schema.Literal("cancelled") }),
);
export type RunEvent = typeof RunEvent.Type;

/** An event as the stream sends it: numbered from 1, so a reader can resume after one. */
export const LoggedRunEvent = Schema.Struct({ seq: Schema.Number, event: RunEvent });
export type LoggedRunEvent = typeof LoggedRunEvent.Type;

/** Whether the run is over. */
export const isFinal = (event: RunEvent): boolean =>
  event.is === "done" || event.is === "failed" || event.is === "cancelled";
