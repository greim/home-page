/**
 * The agent-runs widget API: running a widget's own AI agents (declared under
 * `agents` in its manifest), on the assistant service. The page names the widget,
 * so a widget runs only its own agents, and reaches only the runs it started. A
 * widget with agents gets this API without declaring it. See the `widget-agents`
 * skill; the kit's `useAgentRun` and `useWidgetAgent` are built on it.
 */
import { Schema } from "effect";
import { LoggedRunEvent, maxInputBytes, maxStartBytes, RunFile } from "../agent-runs.ts";
import { apiError, defineApi, link, operation, stream } from "../widget-apis.ts";

/** The run couldn't start: no such agent, too much input, too many runs going, ... */
export const NotStarted = apiError("not-started");
/** The agent ran, but didn't answer: it failed, ran out of turns or budget, or was cancelled. */
export const AgentFailed = apiError("agent-failed");
/** There's no such run of this widget's (it may have ended a while ago). */
export const NoSuchRun = apiError("no-such-run");
/** The run wrote no such file (or there's no such run). */
export const NoSuchFile = apiError("no-such-file");
/** The run isn't waiting for that answer. */
export const NotWaiting = apiError("not-waiting");

const AgentName = Schema.String;
const RunId = Schema.String;
/** A model to run under, when the agent offers a choice; null for its default. */
const Model = Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null });
const Input = Schema.Unknown.pipe(Schema.filter((input) => input !== undefined, {
  message: () => "an agent's input can't be undefined",
}));

export const agentRunsApi = defineApi("agent-runs", "assistant", {
  /** Runs an agent that never asks, to its answer: for agents like the grammar checker. */
  run: operation({
    input: Schema.Struct({ agent: AgentName, input: Input, model: Model }),
    output: Schema.Struct({ output: Schema.Unknown, costUsd: Schema.Number }),
    errors: Schema.Union(NotStarted, AgentFailed),
    maxBytes: maxInputBytes,
  }),
  /** Starts a run; `files` go in its `in/` folder. */
  start: operation({
    input: Schema.Struct({
      agent: AgentName,
      input: Input,
      files: Schema.Array(RunFile),
      model: Model,
    }),
    output: Schema.Struct({ runId: RunId }),
    errors: NotStarted,
    maxBytes: maxStartBytes,
  }),
  /** The run's events after `after` (0 for all), ending with its final one. */
  events: stream({
    input: Schema.Struct({ runId: RunId, after: Schema.NonNegativeInt }),
    item: LoggedRunEvent,
    errors: NoSuchRun,
  }),
  /** Answers what the run is asking; `forRun` allows the rest of the run's uses too. */
  answer: operation({
    input: Schema.Struct({
      runId: RunId,
      askId: Schema.String,
      allow: Schema.Boolean,
      forRun: Schema.Boolean,
    }),
    output: Schema.Null,
    errors: Schema.Union(NoSuchRun, NotWaiting),
  }),
  /** Stops the run; its events end with "cancelled". */
  cancel: operation({
    input: Schema.Struct({ runId: RunId }),
    output: Schema.Null,
    errors: NoSuchRun,
  }),
  /** A file the agent wrote, in the run's `out/` folder, to download. */
  file: link({ input: Schema.Struct({ runId: RunId, name: Schema.String }) }),
  /** A text file the agent wrote, in the run's `out/` folder, for the widget to read (as UTF-8). */
  fileText: operation({
    input: Schema.Struct({ runId: RunId, name: Schema.String }),
    output: Schema.Struct({ text: Schema.String }),
    errors: NoSuchFile,
  }),
}, { services: [] });

export type AgentRunsApi = typeof agentRunsApi;
