/**
 * Runs the visualizer's agent on a chart: the first chart for a dump, or a refinement
 * the user asked for. Sends the dump (as in/data.json) and the request, follows the
 * run (marking the chart as being worked on), and keeps what it made as the chart's
 * new version, with its reply.
 */
import { Either, Schema } from "effect";
import { useEffect, useRef } from "react";
import { useAgentRun } from "../../widget-kit/agent-run.ts";
import { type Chart, inputFor, rowsText, type Version, withAnswer, withEntry } from "./charts.ts";
import { VisualizeAnswer } from "./config.ts";
import { type Rows, type Value } from "./data.ts";
import { setWorking, updateChart } from "./store-live.ts";

const RowsJson = Schema.parseJson(
  Schema.Array(
    Schema.Record({
      key: Schema.String,
      value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null),
    }),
  ),
);

const note = (chartId: string, text: string) =>
  updateChart(chartId, (c) => withEntry(c, { is: "note", text }));

export const useVisualize = () => {
  const run = useAgentRun("visualize", VisualizeAnswer);
  // The chart the current run is for.
  const chartId = useRef<string | null>(null);
  // The last run view taken in, so each run's end is taken in once.
  const handled = useRef<typeof run.view | null>(null);

  useEffect(() => {
    const view = run.view;
    const id = chartId.current;
    if (handled.current === view || id === null) return;
    handled.current = view;
    switch (view.is) {
      case "idle":
      case "starting":
        return;
      case "running":
        setWorking(id, view.progress.at(-1) ?? "Looking at the data…");
        return;
      case "failed":
        setWorking(id, null);
        note(id, `It didn't finish: ${view.message}`);
        return;
      case "cancelled":
        setWorking(id, null);
        note(id, "Stopped.");
        return;
      case "done":
        void takeIn(id, view.runId, view.output, view.files.map((f) => f.name));
        return;
      default:
        return view satisfies never;
    }
  }, [run.view]);

  const read = async (runId: string, name: string): Promise<string | null> => {
    const read = await run.fileText(runId, name);
    return read.ok ? read.value.text : null;
  };

  const takeIn = async (
    id: string,
    runId: string,
    answer: VisualizeAnswer,
    files: ReadonlyArray<string>,
  ) => {
    let version: Version | null = null;
    let rows: Rows | null = null;
    if (answer.rendered && files.includes("spec.json")) {
      const [spec, columnSvg, fullSvg, data] = await Promise.all([
        read(runId, "spec.json"),
        read(runId, "column.svg"),
        read(runId, "full.svg"),
        files.includes("data.json") ? read(runId, "data.json") : Promise.resolve(null),
      ]);
      if (spec !== null && columnSvg !== null && fullSvg !== null) {
        version = {
          spec: Either.getOrNull(Schema.decodeEither(Schema.parseJson())(spec)),
          columnSvg,
          fullSvg,
        };
      }
      if (data !== null) {
        rows = Either.getOrNull(Schema.decodeEither(RowsJson)(data)) as
          | ReadonlyArray<Readonly<Record<string, Value>>>
          | null;
      }
    }
    updateChart(id, (c) => withAnswer(c, answer, version, rows));
    if (answer.rendered && version === null) note(id, "Its chart couldn't be read.");
    setWorking(id, null);
  };

  /** Starts a run on `chart` for `request` (empty for its first chart), from a version. */
  const visualize = (chart: Chart, request: string, versionIndex?: number) => {
    // A run still going is left behind (it's replaced), so its chart isn't being worked on.
    if (chartId.current !== null && chartId.current !== chart.id) {
      setWorking(chartId.current, null);
    }
    chartId.current = chart.id;
    handled.current = null;
    setWorking(chart.id, "Starting…");
    if (request !== "") updateChart(chart.id, (c) => withEntry(c, { is: "user", text: request }));
    const files = chart.data.is === "rows"
      ? [new File([rowsText(chart.data.rows)], "data.json", { type: "application/json" })]
      : [];
    void run.start(inputFor(chart, request, versionIndex), files);
  };

  const busy = run.view.is === "starting" || run.view.is === "running";
  return { visualize, busy, view: run.view, answer: run.answer, cancel: run.cancel };
};
