/**
 * The visualizer's charts, as it keeps them: each pasted dump, the versions of its
 * chart (a Vega-Lite spec and its SVG at both sizes), and the conversation about it.
 * What its agent is given for a request, and the chart after its answer.
 */
import type { Turn, VisualizeAnswer, VisualizeInput } from "./config.ts";
import type { Dump, Rows } from "./data.ts";

/** One version of a chart: its spec, rendered for the column and full screen. */
export type Version = {
  readonly spec: unknown;
  readonly columnSvg: string;
  readonly fullSvg: string;
};

/** What was said about a chart: by the user, the visualizer, or a note on what happened. */
export type Entry = {
  readonly is: "user" | "visualizer" | "note";
  readonly text: string;
};

export type Chart = {
  readonly id: string;
  readonly widgetId: string;
  /** When it was pasted, in ms since the epoch. */
  readonly createdAt: number;
  readonly title: string;
  readonly data: Dump;
  /** Oldest first; none until the first chart is made. */
  readonly versions: ReadonlyArray<Version>;
  readonly entries: ReadonlyArray<Entry>;
};

/** The most turns of a chart's conversation a run is given: older ones are left out. */
export const maxHistory = 30;

/** The largest dump kept: its rows (or text) as JSON. */
export const maxDataChars = 2_000_000;

/** A new chart for a pasted dump, before it's charted. */
export const newChart = (id: string, widgetId: string, data: Dump, now: number): Chart => ({
  id,
  widgetId,
  createdAt: now,
  title: "New chart",
  data,
  versions: [],
  entries: [],
});

/** The dump as JSON, for its size and for the agent's in/data.json. */
export const rowsText = (rows: Rows): string => JSON.stringify(rows);

/** Why a dump is too big to keep, or null if it isn't. */
export const tooBig = (data: Dump): string | null => {
  const chars = data.is === "rows" ? rowsText(data.rows).length : data.text.length;
  return chars > maxDataChars
    ? `That's too much data to chart (${Math.round(chars / 1e6)} MB; at most 2 MB).`
    : null;
};

const turnOf = (entry: Entry): ReadonlyArray<Turn> =>
  entry.is === "note" ? [] : [{ from: entry.is, text: entry.text }];

/**
 * What the agent is given for `request` about `chart`, refining the version at
 * `versionIndex` (the latest, unless the user went back to an earlier one).
 */
export const inputFor = (
  chart: Chart,
  request: string,
  versionIndex: number = chart.versions.length - 1,
): VisualizeInput => {
  const version = chart.versions.at(versionIndex);
  return {
    request,
    format: chart.data.format,
    hasRows: chart.data.is === "rows",
    text: chart.data.is === "text" ? chart.data.text : null,
    current: version === undefined ? null : { title: chart.title, spec: version.spec },
    history: chart.entries.flatMap(turnOf).slice(-maxHistory),
  };
};

export const withEntry = (chart: Chart, entry: Entry): Chart => ({
  ...chart,
  entries: [...chart.entries, entry],
});

/**
 * The chart after the agent's answer: its reply, its title, and the new version (if it
 * rendered one); its data as rows, if it read them from text itself.
 */
export const withAnswer = (
  chart: Chart,
  answer: VisualizeAnswer,
  version: Version | null,
  rows: Rows | null,
): Chart => ({
  ...chart,
  title: answer.title.trim() === "" ? chart.title : answer.title.trim(),
  data: rows !== null && chart.data.is === "text"
    ? { is: "rows", format: chart.data.format, rows }
    : chart.data,
  versions: version === null ? chart.versions : [...chart.versions, version],
  entries: [...chart.entries, { is: "visualizer", text: answer.reply }],
});

/** The chart's latest version, if it has one. */
export const latest = (chart: Chart): Version | null => chart.versions.at(-1) ?? null;

/** What a chart's dump was, in a few words: "120 rows of CSV". */
export const describeData = (data: Dump): string =>
  data.is === "rows"
    ? `${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"} of ${data.format}`
    : `${data.format}, ${data.text.length} characters`;
