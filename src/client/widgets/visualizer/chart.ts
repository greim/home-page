/**
 * Turning the agent's Vega-Lite spec into SVG, in the widget's own look, at the two
 * sizes the widget shows charts: in its column and full screen. Used by the agent's
 * tools (agent-tools.ts), which run in Deno: never import it into the page, which
 * would bundle Vega.
 *
 * The spec is checked first (`prepareSpec`): it may not load anything (no URLs),
 * link anywhere or show images, its data is always the dump (named "dump"), and the
 * widget sets its size, title and look.
 */
import { Effect, Either } from "effect";
import * as vega from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import type { Rows } from "./data.ts";
import { palette } from "./palette.ts";

export type Variant = "column" | "full";

/**
 * Each variant's size and type, in px of a page where 1rem is 20px (its optimal size,
 * see regimes.ts): the column's chart fills a column's width less its padding and the
 * well's (21.4rem - 1rem), so it shows at about this size, its text matching the page's.
 */
export const variants = {
  column: { width: 408, height: 260, label: 13, title: 14, legendOrient: "bottom" },
  full: { width: 960, height: 600, label: 17, title: 19, legendOrient: "right" },
} as const;

const font = '"Google Sans", sans-serif';

/** The widget's look for a variant, as Vega-Lite config. */
export const themeConfig = (variant: Variant): Record<string, unknown> => {
  const v = variants[variant];
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
 * The spec as it's rendered for a variant: its data the dump, sized to the variant
 * (a single view fits it exactly), no title (the widget shows it), and the widget's
 * look over any config of its own. An error message if it can't be.
 */
export const prepareSpec = (
  spec: unknown,
  variant: Variant,
): Either.Either<Record<string, unknown>, string> => {
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
  const v = variants[variant];
  const size = isComposite(spec) ? {} : {
    width: v.width,
    height: v.height,
    autosize: { type: "fit", contains: "padding" },
  };
  return Either.right({
    ...rest,
    data: { name: "dump" },
    ...size,
    padding: 4,
    config: deepMerge(isRecord(config) ? config : {}, themeConfig(variant)),
  });
};

/** A Vega logger that keeps warnings and errors, for the agent. */
const collectingLogger = (messages: Array<string>) => {
  let level = vega.Warn;
  const logger = {
    level(next?: number) {
      if (next === undefined) return level;
      level = next;
      return logger;
    },
    error: (...args: ReadonlyArray<unknown>) => (messages.push(args.map(String).join(" ")), logger),
    warn: (...args: ReadonlyArray<unknown>) => (messages.push(args.map(String).join(" ")), logger),
    info: () => logger,
    debug: () => logger,
  };
  return logger;
};

export type Rendered = { readonly svg: string; readonly warnings: ReadonlyArray<string> };

/** The spec rendered as SVG for a variant, with Vega's warnings; or why it couldn't be. */
export const renderChart = async (
  spec: unknown,
  rows: Rows,
  variant: Variant,
): Promise<Either.Either<Rendered, string>> => {
  const prepared = prepareSpec(spec, variant);
  if (Either.isLeft(prepared)) return Either.left(prepared.left);
  const warnings: Array<string> = [];
  const logger = collectingLogger(warnings);
  // Vega and Vega-Lite throw on specs they can't use: their message is the agent's to fix.
  const result = await Effect.runPromise(Effect.either(Effect.tryPromise({
    try: async () => {
      const compiled = compile(prepared.right as unknown as TopLevelSpec, { logger }).spec;
      const view = new vega.View(vega.parse(compiled), { renderer: "none", logger });
      view.data("dump", structuredClone(rows) as Array<object>);
      const svg = await view.toSVG();
      view.finalize();
      return svg;
    },
    catch: (error) => error instanceof Error ? error.message : String(error),
  })));
  return Either.map(result, (svg) => ({ svg, warnings: [...new Set(warnings)] }));
};
