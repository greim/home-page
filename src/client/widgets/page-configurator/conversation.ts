/**
 * The page configurator's conversation: what the user said, what the configurator
 * answered, and what happened on the page (a change applied or not), as the widget
 * shows and keeps it. Each message is a run of its own, given the conversation so
 * far (see `historyOf`) and the notes it left itself.
 */
import { Either, Schema } from "effect";
import type { ConfiguratorAnswer, ConfiguratorInput, Turn } from "./config.ts";

export const Entry = Schema.Union(
  Schema.Struct({ is: Schema.Literal("user"), text: Schema.String }),
  Schema.Struct({
    is: Schema.Literal("configurator"),
    text: Schema.String,
    /** A message for the assistant, when the request needs code changed. */
    handOff: Schema.NullOr(Schema.String),
  }),
  /** What happened on the page: a change applied, discarded, or failed. */
  Schema.Struct({ is: Schema.Literal("page"), text: Schema.String }),
);
export type Entry = typeof Entry.Type;

export const Conversation = Schema.Struct({
  entries: Schema.Array(Entry),
  /** The notes the configurator left itself after its last answer. */
  notes: Schema.String,
});
export type Conversation = typeof Conversation.Type;

export const emptyConversation: Conversation = { entries: [], notes: "" };

/** The most turns of history a run is given: older ones are left out. */
export const maxHistory = 40;

const turnOf = (entry: Entry): Turn => ({ from: entry.is, text: entry.text });

/** What the agent is given for `message`, sent in `conversation`. */
export const inputFor = (conversation: Conversation, message: string): ConfiguratorInput => ({
  message,
  history: conversation.entries.slice(-maxHistory).map(turnOf),
  notes: conversation.notes,
});

export const withEntry = (conversation: Conversation, entry: Entry): Conversation => ({
  ...conversation,
  entries: [...conversation.entries, entry],
});

/** The conversation after the configurator's answer. */
export const withAnswer = (
  conversation: Conversation,
  answer: ConfiguratorAnswer,
): Conversation => ({
  entries: [...conversation.entries, {
    is: "configurator",
    text: answer.reply,
    handOff: answer.handOff,
  }],
  notes: answer.notes,
});

/** A conversation as kept in the browser. */
export const conversationText = (conversation: Conversation): string =>
  JSON.stringify(conversation);

/** A conversation kept in the browser, or a fresh one if there's none (or it's unreadable). */
export const readConversation = (text: string | null): Conversation =>
  text === null ? emptyConversation : Either.getOrElse(
    Either.flatMap(
      Either.try({ try: (): unknown => JSON.parse(text), catch: String }),
      (json) => Schema.decodeUnknownEither(Conversation)(json),
    ),
    () => emptyConversation,
  );
