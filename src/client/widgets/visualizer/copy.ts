/**
 * What "Export" copies or saves on the clipboard for a chart: a picture of it (PNG, made in the
 * page: see copy-live.ts), its SVG, its Vega-Lite spec whole (data, size and look
 * included, so it renders the same anywhere Vega-Lite does), or the data as pasted.
 */
import type { Chart, Version } from "./charts.ts";
import { palette } from "./palette.ts";
import { prepareSpec } from "./spec.ts";
import { Either } from "effect";

export const copyFormats = ["png", "svg", "vega-lite", "data"] as const;
export type CopyFormat = (typeof copyFormats)[number];

export const copyFormatLabels: Readonly<Record<CopyFormat, string>> = {
  png: "PNG",
  svg: "SVG",
  "vega-lite": "Vega-Lite",
  data: "Original data",
};

/** The chart's SVG, standing alone: on the charts' surface, as it's shown. */
export const standaloneSvg = (svg: string): string =>
  svg.replace(
    /<svg\b[^>]*>/,
    (open) => `${open}<rect width="100%" height="100%" fill="${palette.surface}"/>`,
  );

/** The version's spec, whole: its data inline, at the chart's size, in the widget's look. */
export const standaloneSpec = (chart: Chart, version: Version): string => {
  const prepared = Either.getOrElse(
    prepareSpec(version.spec),
    () => ({}) as Record<string, unknown>,
  );
  const values = chart.data.is === "rows" ? chart.data.rows : [];
  const config = (prepared["config"] ?? {}) as Record<string, unknown>;
  return JSON.stringify(
    {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      title: chart.title,
      ...prepared,
      data: { values },
      config: { ...config, background: palette.surface },
    },
    null,
    2,
  );
};

/**
 * The data as it was pasted; as JSON rows (or the text) for charts kept before that
 * was, and charts made from an image (whose image is copied instead, when there is one).
 */
export const originalData = (chart: Chart): string => {
  if (chart.original !== "") return chart.original;
  switch (chart.data.is) {
    case "rows":
      return JSON.stringify(chart.data.rows, null, 2);
    case "text":
      return chart.data.text;
    case "image":
      return "";
    default:
      return chart.data satisfies never;
  }
};

/** The extension (no dot) and type of the file that saving `format` writes. */
export const fileKind = (
  format: CopyFormat,
  chart: Chart,
): { readonly extension: string; readonly mime: string } => {
  switch (format) {
    case "png":
      return { extension: "png", mime: "image/png" };
    case "svg":
      return { extension: "svg", mime: "image/svg+xml" };
    case "vega-lite":
      return { extension: "vl.json", mime: "application/json" };
    case "data": {
      // A chart made from an image saves the image.
      if (chart.image !== null) return { extension: "png", mime: "image/png" };
      if (chart.data.is === "text") return { extension: "txt", mime: "text/plain" };
      switch (chart.data.format) {
        case "CSV":
          return { extension: "csv", mime: "text/csv" };
        case "TSV":
          return { extension: "tsv", mime: "text/tab-separated-values" };
        case "JSON":
          return { extension: "json", mime: "application/json" };
        case "an HTML table":
          return { extension: "html", mime: "text/html" };
        default:
          return { extension: "txt", mime: "text/plain" };
      }
    }
    default:
      return format satisfies never;
  }
};
