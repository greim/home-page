/**
 * The visualizer's config (just a heading), what its agent is given, and the answer it
 * gives. The charts themselves are kept in the browser (store-live.ts), not here.
 */
import { Schema } from "effect";

export const VisualizerConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type VisualizerConfig = typeof VisualizerConfig.Type;

/** One turn of a chart's conversation so far, as the agent is given it. */
export const Turn = Schema.Struct({
  /** Who said it: the user, or the visualizer (the agent itself). */
  from: Schema.Literal("user", "visualizer"),
  text: Schema.String,
});
export type Turn = typeof Turn.Type;

/** What the agent is given. The data, when it could be read as rows, is in in/data.json. */
export const VisualizeInput = Schema.Struct({
  /** What the user asked for; empty for a first chart, when they just pasted. */
  request: Schema.String,
  /** What the paste looked like: "JSON", "CSV", "an HTML table", "text"… */
  format: Schema.String,
  /** Whether in/data.json holds the data as rows. */
  hasRows: Schema.Boolean,
  /** The pasted text, when it couldn't be read as rows; null when it could. */
  text: Schema.NullOr(Schema.String),
  /** The chart's current Vega-Lite spec and title, when refining one. */
  current: Schema.NullOr(Schema.Struct({ title: Schema.String, spec: Schema.Unknown })),
  /** The conversation about this chart before this request, oldest first. */
  history: Schema.Array(Turn),
});
export type VisualizeInput = typeof VisualizeInput.Type;

export const VisualizeAnswer = Schema.Struct({
  title: Schema.String.annotations({
    description: "A short title for the chart, as for a list of charts: what it shows, in a " +
      "few words (e.g. 'Monthly signups, 2025').",
  }),
  reply: Schema.String.annotations({
    description: "What you say to the user: short, plain text (not Markdown). What the chart " +
      "shows and why you chose that form, or what you changed; or, if you couldn't chart it, why.",
  }),
  rendered: Schema.Boolean.annotations({
    description: "Whether your last call to render_chart succeeded, so the chart is ready. " +
      "False if you only answered, or couldn't make a chart.",
  }),
});
export type VisualizeAnswer = typeof VisualizeAnswer.Type;
