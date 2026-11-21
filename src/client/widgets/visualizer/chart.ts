/**
 * Turning the agent's Vega-Lite spec into SVG, in the widget's own look, at the one
 * size every chart is drawn (spec.ts), to be scaled wherever it's shown. Used by the agent's
 * tools (agent-tools.ts), which run in Deno: never import it into the page, which
 * would bundle Vega.
 */
import { Effect, Either } from "effect";
import * as vega from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import type { Rows } from "./data.ts";
import { prepareSpec } from "./spec.ts";

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

/** The spec rendered as SVG, with Vega's warnings; or why it couldn't be. */
export const renderChart = async (
  spec: unknown,
  rows: Rows,
): Promise<Either.Either<Rendered, string>> => {
  const prepared = prepareSpec(spec);
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
