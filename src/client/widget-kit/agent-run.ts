/**
 * A run of one of a widget's agents, as the widget shows it: started with input (and
 * files), it reports progress, may ask the user to allow something, and ends with an
 * answer (and files to download), a failure, or being cancelled. `useAgentRun` keeps
 * this state; `AgentRunPanel` (agent-run-panel.tsx) shows it. See the `widget-agents`
 * skill.
 */
import { Either, Schema } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isFinal,
  type LoggedRunEvent,
  type OutFile,
  type RunRequest,
} from "../../common/agent-runs.ts";
import { agentRunsApi } from "../../common/apis/agent-runs.ts";
import { useWidgetApi } from "./apis.tsx";

export type Ask = {
  readonly askId: string;
  readonly capability: string;
  readonly action: string;
  readonly detail: string;
};

export type RunView<A> =
  | { readonly is: "idle" }
  | { readonly is: "starting" }
  | {
    readonly is: "running";
    readonly runId: string;
    readonly progress: ReadonlyArray<string>;
    /** What the agent is waiting for the user to allow, if anything. */
    readonly ask: Ask | null;
  }
  | {
    readonly is: "done";
    readonly runId: string;
    readonly progress: ReadonlyArray<string>;
    readonly output: A;
    readonly costUsd: number;
    readonly files: ReadonlyArray<OutFile>;
  }
  | { readonly is: "failed"; readonly progress: ReadonlyArray<string>; readonly message: string }
  | { readonly is: "cancelled"; readonly progress: ReadonlyArray<string> };

const progressOf = <A>(view: RunView<A>): ReadonlyArray<string> =>
  view.is === "idle" || view.is === "starting" ? [] : view.progress;

/** The view after one of the run's events; the answer is decoded with `output`. */
export const nextView = <A, I>(
  view: RunView<A>,
  logged: LoggedRunEvent,
  output: Schema.Schema<A, I>,
): RunView<A> => {
  const runId = view.is === "running" ? view.runId : "";
  const progress = progressOf(view);
  const { event } = logged;
  switch (event.is) {
    case "progress":
      return view.is === "running" ? { ...view, progress: [...progress, event.text] } : view;
    case "ask":
      return view.is === "running"
        ? {
          ...view,
          ask: {
            askId: event.askId,
            capability: event.capability,
            action: event.action,
            detail: event.detail,
          },
        }
        : view;
    case "answered":
      return view.is === "running" && view.ask?.askId === event.askId
        ? { ...view, ask: null }
        : view;
    case "done": {
      const decoded = Schema.decodeUnknownEither(output)(event.output);
      return Either.isRight(decoded)
        ? {
          is: "done",
          runId,
          progress,
          output: decoded.right,
          costUsd: event.costUsd,
          files: event.files,
        }
        : {
          is: "failed",
          progress,
          message: `The agent's answer didn't fit: ${decoded.left.message}`,
        };
    }
    case "failed":
      return { is: "failed", progress, message: event.message };
    case "cancelled":
      return { is: "cancelled", progress };
    default:
      return event satisfies never;
  }
};

/** A file's contents as base64, to send with a run. */
const fileBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/** What an agent is given: anything JSON, as the widget's agent expects it. */
export type AgentInput = RunRequest["input"];

/**
 * Runs of this widget's agent `agentName`, whose answer is decoded with `output`.
 * `start` begins one (replacing any before it); `answer` replies to what it's asking;
 * `cancel` stops it; `fileUrl` is where to download a file it wrote, and `fileText`
 * reads one (a text file) for the widget itself, given the finished run's ID. Built on the
 * agent-runs widget API, so use it in a widget's `widget` or `full-screen` view.
 */
export const useAgentRun = <A, I>(agentName: string, output: Schema.Schema<A, I>) => {
  const runs = useWidgetApi(agentRunsApi);
  const [view, setView] = useState<RunView<A>>({ is: "idle" });
  // Each run's reading stops when another starts, or the view goes away.
  const reading = useRef<AbortController | null>(null);
  useEffect(() => () => reading.current?.abort(), []);

  const follow = useCallback(async (runId: string, signal: AbortSignal) => {
    let after = 0;
    // Reconnects (from the last event seen) if the stream drops partway through the run.
    while (!signal.aborted) {
      let progressed = false;
      let finished = false;
      const { items, result } = runs.events({ runId, after }, { signal });
      for await (const logged of items) {
        progressed = true;
        after = logged.seq;
        finished ||= isFinal(logged.event);
        setView((v) => nextView(v, logged, output));
      }
      const ended = await result;
      if (finished || signal.aborted) return;
      if (!progressed) {
        const message = ended.ok ? "The run was lost." : ended.error.message;
        setView((v) => ({ is: "failed", progress: progressOf(v), message }));
        return;
      }
    }
  }, [runs, output]);

  const start = useCallback(async (input: AgentInput, files: ReadonlyArray<File> = []) => {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setView({ is: "starting" });
    const started = await runs.start({
      agent: agentName,
      input,
      files: await Promise.all(
        files.map(async (f) => ({ name: f.name, base64: await fileBase64(f) })),
      ),
    }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!started.ok) {
      setView({ is: "failed", progress: [], message: started.error.message });
      return;
    }
    const { runId } = started.value;
    setView({ is: "running", runId, progress: [], ask: null });
    await follow(runId, controller.signal);
  }, [runs, agentName, follow]);

  const answer = useCallback((allow: boolean, forRun = false) => {
    if (view.is !== "running" || view.ask === null) return;
    void runs.answer({ runId: view.runId, askId: view.ask.askId, allow, forRun });
  }, [runs, view]);

  const cancel = useCallback(() => {
    if (view.is === "running") void runs.cancel({ runId: view.runId });
  }, [runs, view]);

  const fileUrl = useCallback(
    (name: string) => view.is === "done" ? runs.file({ runId: view.runId, name }) : "",
    [runs, view],
  );

  const fileText = useCallback(
    (runId: string, name: string, options?: { readonly signal?: AbortSignal }) =>
      runs.fileText({ runId, name }, options),
    [runs],
  );

  return { view, start, answer, cancel, fileUrl, fileText };
};
