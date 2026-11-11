/**
 * A widget agent's run, as the assistant service and the widget kit see it: started
 * with input (and files), it reports progress, may ask the user to allow something,
 * and ends with an answer (and files to download), a failure, or being cancelled.
 * Widgets reach runs through the agent-runs widget API (src/common/apis/agent-runs.ts).
 */
import { Schema } from "effect";

/** The most a run's input may be, for an agent run to its answer. */
export const maxInputBytes = 200_000;

/** The most a run's start may be, its files included. */
export const maxStartBytes = 30_000_000;

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
  /**
   * A model to run under, for an agent whose manifest offers a choice. The run starts
   * only if the agent offers this model; left out, it runs under the agent's default.
   */
  model: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
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
