/**
 * The agent's Vega-Lite spec as it's rendered: checked first (it may not load anything
 * (no URLs), link anywhere or show images), its data always the dump (named "dump"),
 * and its size, title and look set by the widget. Plain data, with no Vega: the page
 * uses it too, to copy a chart's spec whole.
 */
import { Either } from "effect";
import { palette } from "./palette.ts";

/**
 * Every chart's one size, type and padding, in the SVG's px. It's drawn once, at this
 * size, and scaled to wherever it's shown: full screen, a thumbnail in the column, a
 * PNG. So it looks the same everywhere, just bigger or smaller.
 */
export const chartSize = {
  width: 960,
  height: 600,
  label: 17,
  title: 19,
  padding: 28,
  legendOrient: "right",
} as const;

/** The chart's shape, as a CSS aspect ratio. */
export const chartAspect = `${chartSize.width} / ${chartSize.height}`;

const font = '"Google Sans", sans-serif';

/** The widget's look, as Vega-Lite config. */
export const themeConfig = (): Record<string, unknown> => {
  const v = chartSize;
  const text = { labelFont: font, titleFont: font, labelFontSize: v.label, titleFontSize: v.title };
  return {
    background: null,
    font,
    view: { stroke: null, continuousWidth: v.width / 2.5, continuousHeight: v.height / 2.5 },
    axis: {
      ...text,
      labelColor: palette.secondaryText,
      titleColor: palette.text,
      titleFontWeight: 500,
      domainColor: palette.axis,
      tickColor: palette.axis,
      gridColor: palette.grid,
      labelOverlap: true,
      labelLimit: v.width / 4,
      titlePadding: 8,
    },
    legend: {
      ...text,
      labelColor: palette.secondaryText,
      titleColor: palette.text,
      titleFontWeight: 500,
      orient: v.legendOrient,
      labelLimit: v.width / 4,
      symbolSize: v.label * 8,
    },
    header: { ...text, labelColor: palette.text, titleColor: palette.text },
    title: { font, color: palette.text, fontSize: v.title + 2, fontWeight: 500, anchor: "start" },
    text: { font, color: palette.text, fontSize: v.label },
    mark: { color: palette.categories[0] },
    bar: { cornerRadiusEnd: 3 },
    line: { strokeWidth: 2 },
    point: { size: 64, filled: true },
    arc: { stroke: palette.surface, strokeWidth: 2 },
    rect: { stroke: palette.surface, strokeWidth: 1 },
    range: {
      category: [...palette.categories],
      ordinal: [...palette.sequential],
      ramp: [...palette.sequential],
      heatmap: [...palette.sequential],
      diverging: [...palette.diverging],
    },
  };
};

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

/** `over` merged into `base`, objects merged key by key, anything else replaced. */
export const deepMerge = (
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(over)])].map((k) => {
      const b = base[k];
      const o = over[k];
      return [k, isRecord(b) && isRecord(o) ? deepMerge(b, o) : k in over ? o : b];
    }),
  );

/** What a spec may not hold anywhere: what loads, links or embeds something. */
const forbiddenKeys: Readonly<Record<string, string>> = {
  url: "Charts can't load anything: leave out url (the data is the user's, named \"dump\").",
  href: "Charts can't link anywhere: leave out href.",
  image: "Charts can't show images.",
};

/** The first forbidden thing in a spec, as a message; null if there's none. */
export const forbidden = (u: unknown): string | null => {
  if (Array.isArray(u)) {
    for (const item of u) {
      const found = forbidden(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(u)) return null;
  for (const [k, v] of Object.entries(u)) {
    const message = forbiddenKeys[k];
    if (message !== undefined) return message;
    if (k === "mark" && (v === "image" || (isRecord(v) && v["type"] === "image"))) {
      return forbiddenKeys["image"] ?? null;
    }
    const found = forbidden(v);
    if (found !== null) return found;
  }
  return null;
};

const compositeKeys = ["facet", "repeat", "concat", "hconcat", "vconcat"];

/** Whether a spec is several views (facets, repeats or concatenations), sized per view. */
export const isComposite = (spec: Record<string, unknown>): boolean => {
  const encoding = spec["encoding"];
  return compositeKeys.some((k) => k in spec) ||
    (isRecord(encoding) && ("row" in encoding || "column" in encoding || "facet" in encoding));
};

/**
 * The spec as it's rendered: its data the dump, at the chart's size (a single view fits
 * it exactly), no title (the widget shows it), and the widget's look over any config of
 * its own. An error message if it can't be.
 */
export const prepareSpec = (spec: unknown): Either.Either<Record<string, unknown>, string> => {
  if (!isRecord(spec)) return Either.left("The spec must be a Vega-Lite spec: a JSON object.");
  const problem = forbidden(spec);
  if (problem !== null) return Either.left(problem);
  const {
    $schema: _schema,
    config,
    title: _title,
    width: _width,
    height: _height,
    autosize: _autosize,
    padding: _padding,
    background: _background,
    data: _data,
    datasets: _datasets,
    ...rest
  } = spec;
  const v = chartSize;
  const size = isComposite(spec) ? {} : {
    width: v.width,
    height: v.height,
    autosize: { type: "fit", contains: "padding" },
  };
  return Either.right({
    ...rest,
    data: { name: "dump" },
    ...size,
    padding: v.padding,
    config: deepMerge(isRecord(config) ? config : {}, themeConfig()),
  });
};
