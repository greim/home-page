/**
 * The page configurator's config (just a heading), what its agent is given, and the
 * answer it gives.
 */
import { Schema } from "effect";

export const PageConfiguratorConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type PageConfiguratorConfig = typeof PageConfiguratorConfig.Type;

/** One turn of the conversation so far, as the agent is given it. */
export const Turn = Schema.Struct({
  /** Who said it: the user, the configurator (the agent itself), or the page (what happened). */
  from: Schema.Literal("user", "configurator", "page"),
  text: Schema.String,
});
export type Turn = typeof Turn.Type;

/** What the agent is given with each message (the layout itself is in in/layout.json). */
export const ConfiguratorInput = Schema.Struct({
  message: Schema.String,
  /** The conversation before this message, oldest first. */
  history: Schema.Array(Turn),
  /** The notes it left itself last time, if any. */
  notes: Schema.String,
});
export type ConfiguratorInput = typeof ConfiguratorInput.Type;

export const ConfiguratorAnswer = Schema.Struct({
  reply: Schema.String.annotations({
    description: "What you say to the user: short, plain text (not Markdown), describing what " +
      "you changed on their page, or answering them, or asking what they meant.",
  }),
  changed: Schema.Boolean.annotations({
    description: "Whether you changed the layout, and check_layout passed after your last edit. " +
      "False if you only answered or asked.",
  }),
  notes: Schema.String.annotations({
    description: "Notes for yourself, for the user's next message: what you found out (a URL, " +
      "say), options you offered, what you were about to do. Empty if there's nothing to keep.",
  }),
  handOff: Schema.NullOr(Schema.String).annotations({
    description: "Only when the request needs code changed (a widget type that doesn't exist " +
      "yet, a feature a widget lacks, a bug): a message the user can give the page's assistant, " +
      "who can change code, saying what's needed. Null otherwise.",
  }),
});
export type ConfiguratorAnswer = typeof ConfiguratorAnswer.Type;
