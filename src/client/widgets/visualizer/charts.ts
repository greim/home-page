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
  /** Drawn at the chart's one size (spec.ts), scaled wherever it's shown. */
  readonly svg: string;
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
  /**
   * What was pasted, as plain text (a table copied from a page comes as tab-separated
   * text); empty for charts kept before it was.
   */
  readonly original: string;
  /** The image pasted, when the data came as one; null otherwise. */
  readonly image: Blob | null;
  /** Oldest first; none until the first chart is made. */
  readonly versions: ReadonlyArray<Version>;
  readonly entries: ReadonlyArray<Entry>;
};

/** The most turns of a chart's conversation a run is given: older ones are left out. */
export const maxHistory = 30;

/** The largest dump kept: its rows (or text) as JSON. */
export const maxDataChars = 2_000_000;

/** A new chart for a pasted dump, before it's charted. */
export const newChart = (pasted: {
  readonly id: string;
  readonly widgetId: string;
  readonly data: Dump;
  readonly original: string;
  readonly image: Blob | null;
  readonly now: number;
}): Chart => ({
  id: pasted.id,
  widgetId: pasted.widgetId,
  createdAt: pasted.now,
  title: "New chart",
  data: pasted.data,
  original: pasted.original,
  image: pasted.image,
  versions: [],
  entries: [],
});

/** The dump as JSON, for its size and for the agent's in/data.json. */
export const rowsText = (rows: Rows): string => JSON.stringify(rows);

/** The largest image the agent is given (Claude reads images up to 5 MB). */
export const maxImageBytes = 5_000_000;

const megabytes = (n: number) => `${Math.max(1, Math.round(n / 1e6))} MB`;

/** Why a dump is too big to keep, or null if it isn't. */
export const tooBig = (data: Dump, original: string, image: Blob | null): string | null => {
  if (image !== null && image.size > maxImageBytes) {
    return `That image is too big to chart (${megabytes(image.size)}; at most 5 MB).`;
  }
  const chars = original.length +
    (data.is === "rows" ? rowsText(data.rows).length : data.is === "text" ? data.text.length : 0);
  return chars > maxDataChars
    ? `That's too much data to chart (${megabytes(chars)}; at most 2 MB).`
    : null;
};

/** The image's file name in the agent's in/ folder. */
export const imageName = (type: string): string =>
  `image.${type.replace(/^image\//, "").replace("jpeg", "jpg")}`;

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
    image: chart.data.is === "image" ? imageName(chart.data.type) : null,
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
 * rendered one); its data as rows, if it read them from text or an image itself.
 */
export const withAnswer = (
  chart: Chart,
  answer: VisualizeAnswer,
  version: Version | null,
  rows: Rows | null,
): Chart => ({
  ...chart,
  title: answer.title.trim() === "" ? chart.title : answer.title.trim(),
  data: rows !== null && chart.data.is !== "rows"
    ? { is: "rows", format: chart.data.format, rows }
    : chart.data,
  versions: version === null ? chart.versions : [...chart.versions, version],
  entries: [...chart.entries, { is: "visualizer", text: answer.reply }],
});

/** The chart's latest version, if it has one. */
export const latest = (chart: Chart): Version | null => chart.versions.at(-1) ?? null;

/** What a chart's dump was, in a few words: "120 rows of CSV". */
export const describeData = (data: Dump): string => {
  switch (data.is) {
    case "rows":
      return `${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"} of ${data.format}`;
    case "text":
      return `${data.format}, ${data.text.length} characters`;
    case "image":
      return data.format;
    default:
      return data satisfies never;
  }
};
