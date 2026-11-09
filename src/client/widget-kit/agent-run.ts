/**
 * A run of one of a widget's agents, as the widget shows it: started with input (and
 * files), it reports progress, may ask the user to allow something, and ends with an
 * answer (and files to download), a failure, or being cancelled. `useAgentRun` keeps
 * this state; `AgentRunPanel` (agent-run-panel.tsx) shows it. See the `widget-agents`
 * skill.
 */
import { Either, Schema } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { assistantPortMetaName } from "../../common/assistant.ts";
import { LoggedRunEvent, type OutFile, runsPath } from "../../common/agent-runs.ts";

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

/** Where a run's routes are: the assistant service's port, on the host the page was loaded from. */
export const runsBase = (
  page: { readonly protocol: string; readonly hostname: string },
  port: string,
): string => `${page.protocol}//${page.hostname}:${port}${runsPath}`;

/** Splits text into whole lines, keeping a partial last line for the next chunk. */
export const splitLines = (
  pending: string,
  chunk: string,
): { readonly lines: ReadonlyArray<string>; readonly pending: string } => {
  const parts = (pending + chunk).split("\n");
  return { lines: parts.slice(0, -1).filter((l) => l.trim() !== ""), pending: parts.at(-1) ?? "" };
};

const decodeLogged = Schema.decodeUnknownEither(Schema.parseJson(LoggedRunEvent));

/** A file's contents as base64, to send with a run. */
const fileBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const base = () =>
  runsBase(
    location,
    document.querySelector(`meta[name="${assistantPortMetaName}"]`)?.getAttribute("content") ?? "",
  );

/**
 * Runs of widget `widgetType`'s agent `agentName`, whose answer is decoded with `output`.
 * `start` begins one (replacing any before it); `answer` replies to what it's asking;
 * `cancel` stops it; `fileUrl` is where to download a file it wrote.
 */
export const useAgentRun = <A, I>(
  widgetType: string,
  agentName: string,
  output: Schema.Schema<A, I>,
) => {
  const [view, setView] = useState<RunView<A>>({ is: "idle" });
  // Each run's reading stops when another starts, or the view goes away.
  const reading = useRef<AbortController | null>(null);
  useEffect(() => () => reading.current?.abort(), []);

  const follow = useCallback(async (runId: string, signal: AbortSignal) => {
    let after = 0;
    let finished = false;
    // Reconnects (from the last event seen) if the stream drops before the run ends.
    while (!finished && !signal.aborted) {
      const response = await fetch(`${base()}${runId}/events?after=${after}`, { signal })
        .catch(() => null);
      if (response === null || !response.ok || response.body === null) {
        if (!signal.aborted) {
          setView((v) => ({ is: "failed", progress: progressOf(v), message: "The run was lost." }));
        }
        return;
      }
      let pending = "";
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        const split = splitLines(pending, chunk);
        pending = split.pending;
        for (const line of split.lines) {
          const logged = decodeLogged(line);
          if (Either.isLeft(logged)) continue;
          after = logged.right.seq;
          finished ||= ["done", "failed", "cancelled"].includes(logged.right.event.is);
          setView((v) => nextView(v, logged.right, output));
        }
      }
    }
  }, [output]);

  const start = useCallback(async (input: unknown, files: ReadonlyArray<File> = []) => {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setView({ is: "starting" });
    const body = JSON.stringify({
      input,
      files: await Promise.all(
        files.map(async (f) => ({ name: f.name, base64: await fileBase64(f) })),
      ),
    });
    const response = await fetch(
      `${base()}${encodeURIComponent(widgetType)}/${encodeURIComponent(agentName)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      },
    ).catch((
      cause,
    ) => ({ ok: false, status: 0, text: () => Promise.resolve(String(cause)) } as const));
    if (!response.ok) {
      const message = (await response.text()).trim();
      setView({
        is: "failed",
        progress: [],
        message: message || `The assistant service answered ${response.status}.`,
      });
      return;
    }
    const { runId } = await response.json() as { runId: string };
    setView({ is: "running", runId, progress: [], ask: null });
    await follow(runId, controller.signal);
  }, [widgetType, agentName, follow]);

  const answer = useCallback((allow: boolean, forRun = false) => {
    if (view.is !== "running" || view.ask === null) return;
    void fetch(`${base()}${view.runId}/answers/${encodeURIComponent(view.ask.askId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allow, forRun }),
    });
  }, [view]);

  const cancel = useCallback(() => {
    if (view.is === "running") void fetch(`${base()}${view.runId}/cancel`, { method: "POST" });
  }, [view]);

  const fileUrl = useCallback(
    (name: string) =>
      view.is === "done" ? `${base()}${view.runId}/files/${encodeURIComponent(name)}` : "",
    [view],
  );

  return { view, start, answer, cancel, fileUrl };
};
