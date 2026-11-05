/** The admin assistant's chat, as a pure reducer over what the user and server do. */
import { Either, Schema } from "effect";
import type { ChatEvent } from "../../../common/assistant.ts";

export type ChatEntry =
  | { is: "user"; text: string }
  | { is: "assistant"; text: string }
  | { is: "activity"; label: string }
  | { is: "applied" }
  | { is: "rejected"; message: string }
  | { is: "error"; message: string }
  | { is: "summary"; text: string };

export type Chat = {
  /** The conversation to continue; null until the server starts one. */
  readonly sessionId: string | null;
  readonly entries: ReadonlyArray<ChatEntry>;
  /** A turn is in progress. */
  readonly busy: boolean;
};

export type ChatAction =
  | { is: "send"; text: string }
  | { is: "event"; event: ChatEvent }
  /** The request itself failed (e.g. the server is unreachable). */
  | { is: "failed"; message: string }
  /** The server finished responding. */
  | { is: "finished" }
  /** Starts a new conversation. */
  | { is: "reset" };

export const emptyChat: Chat = { sessionId: null, entries: [], busy: false };

/** e.g. "$0.04 · 23s", or "12s" when the cost isn't known. */
export const summaryText = (costUsd: number | null, durationMs: number): string => {
  const seconds = `${Math.max(1, Math.round(durationMs / 1000))}s`;
  return costUsd === null ? seconds : `$${costUsd.toFixed(2)} · ${seconds}`;
};

const eventEntry = (event: Exclude<ChatEvent, { is: "session" }>): ChatEntry => {
  switch (event.is) {
    case "text":
      return { is: "assistant", text: event.text };
    case "activity":
      return { is: "activity", label: event.label };
    case "applied":
      return { is: "applied" };
    case "rejected":
      return { is: "rejected", message: event.message };
    case "error":
      return { is: "error", message: event.message };
    case "done":
      return { is: "summary", text: summaryText(event.costUsd, event.durationMs) };
    default:
      return event satisfies never;
  }
};

const append = (chat: Chat, entry: ChatEntry): Chat => ({
  ...chat,
  entries: [...chat.entries, entry],
});

export const chatReducer = (chat: Chat, action: ChatAction): Chat => {
  switch (action.is) {
    case "send":
      return { ...append(chat, { is: "user", text: action.text }), busy: true };
    case "event":
      return action.event.is === "session"
        ? { ...chat, sessionId: action.event.sessionId }
        : append(chat, eventEntry(action.event));
    case "failed":
      return { ...append(chat, { is: "error", message: action.message }), busy: false };
    case "finished":
      return { ...chat, busy: false };
    case "reset":
      return emptyChat;
    default:
      return action satisfies never;
  }
};

const SavedEntry = Schema.Union(
  Schema.Struct({ is: Schema.Literal("user", "assistant", "summary"), text: Schema.String }),
  Schema.Struct({ is: Schema.Literal("activity"), label: Schema.String }),
  Schema.Struct({ is: Schema.Literal("applied") }),
  Schema.Struct({ is: Schema.Literal("rejected", "error"), message: Schema.String }),
);

/** A chat as kept in browser storage, so the conversation survives a reload. */
const SavedChat = Schema.parseJson(Schema.Struct({
  sessionId: Schema.NullOr(Schema.String),
  entries: Schema.Array(SavedEntry),
  busy: Schema.Boolean,
}));

export const saveChat = (chat: Chat): string => JSON.stringify(chat);

/**
 * The chat saved by saveChat, or an empty one if nothing usable was saved. A
 * turn that was in progress can't be picked up again, so it's marked as cut off.
 */
export const restoreChat = (saved: string | null): Chat => {
  if (saved === null) return emptyChat;
  const decoded = Schema.decodeUnknownEither(SavedChat)(saved);
  if (Either.isLeft(decoded)) return emptyChat;
  const { sessionId, entries, busy } = decoded.right;
  const chat: Chat = { sessionId, entries, busy: false };
  return busy
    ? append(chat, { is: "error", message: "The page was reloaded before this reply finished." })
    : chat;
};
