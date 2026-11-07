/**
 * A conversation with the assistant, as a pure reducer over what the user and
 * the assistant service do.
 */
import { Either, Schema } from "effect";
import { type ChatEvent, type LoggedEvent, Question } from "../../common/assistant.ts";

export type PermissionState = "waiting" | "allowed" | "denied" | "cancelled";
export type QuestionState = "waiting" | "answered" | "cancelled";

export type ToolResult = { readonly text: string; readonly isError: boolean };

export type ChatEntry =
  | { is: "user"; text: string }
  /** Images the user attached to the message before it (they aren't kept, only counted). */
  | { is: "attachments"; count: number }
  | { is: "assistant"; text: string }
  | {
    is: "tool";
    toolUseId: string;
    name: string;
    label: string;
    input: Readonly<Record<string, unknown>>;
    /** Null until the tool returns. */
    result: ToolResult | null;
  }
  | {
    is: "permission";
    requestId: string;
    tool: string;
    detail: string;
    canAlways: boolean;
    state: PermissionState;
  }
  | { is: "question"; requestId: string; questions: ReadonlyArray<Question>; state: QuestionState }
  | { is: "applied" }
  | { is: "rejected"; message: string }
  | { is: "error"; message: string }
  | { is: "summary"; text: string }
  | { is: "notice"; text: string; tone: "info" | "success" | "error" }
  /** The page's code changed: offers to reload it. */
  | { is: "reload" };

export type Chat = {
  /** The conversation to continue; null until the service starts one. */
  readonly sessionId: string | null;
  readonly entries: ReadonlyArray<ChatEntry>;
  /** A turn is in progress. */
  readonly busy: boolean;
  /** The service's log the conversation's events are in, and the last one seen, to resume after a reload. */
  readonly log: string | null;
  readonly seq: number;
  /** The session's permission mode, as last reported; null before it's known. */
  readonly mode: string | null;
  /** What the agent is writing right now, until its finished text arrives. Not saved. */
  readonly draft: string;
  /** What the conversation has used so far, as last reported; null before it's known. */
  readonly usage: Usage | null;
  /** The model the user chose (e.g. "opus"); null for Claude Code's default. */
  readonly model: string | null;
};

export type Usage = {
  readonly costUsd: number | null;
  readonly contextPercent: number | null;
  readonly model: string | null;
};

/** e.g. "claude-opus-5-5 · 23% of context · $1.20 so far", from what's known. */
export const usageText = (usage: Usage): string =>
  [
    usage.model,
    usage.contextPercent === null ? null : `${Math.round(usage.contextPercent)}% of context`,
    usage.costUsd === null ? null : `$${usage.costUsd.toFixed(2)} so far`,
  ].filter((part) => part !== null).join(" · ");

export type ChatAction =
  | { is: "send"; text: string; images: number }
  /** The service took the message: its turn's events are the ones in `log` after `after`. */
  | { is: "accepted"; log: string; after: number }
  /** Following the service's log `log` from after `after` (e.g. a new one, after it restarted). */
  | { is: "attached"; log: string; after: number }
  | { is: "event"; logged: LoggedEvent }
  /** Talking to the service failed (e.g. it's unreachable, or busy with another turn). */
  | { is: "failed"; message: string }
  /** Something went wrong that doesn't end the turn (e.g. an answer didn't reach the service). */
  | { is: "warning"; message: string }
  /** The user changed the permission mode (the service confirmed it). */
  | { is: "mode"; mode: string }
  /** The user chose a model (the service confirmed it); null for the default. */
  | { is: "model"; model: string | null }
  /** Switches to a past conversation, shown from its history. */
  | { is: "history"; sessionId: string; events: ReadonlyArray<ChatEvent> }
  /** Starts a new conversation. */
  | { is: "reset" };

export const emptyChat: Chat = {
  sessionId: null,
  entries: [],
  busy: false,
  log: null,
  seq: 0,
  mode: null,
  draft: "",
  usage: null,
  model: null,
};

/** e.g. "$0.04 · 23s", or "12s" when the cost isn't known. */
export const summaryText = (costUsd: number | null, durationMs: number): string => {
  const seconds = `${Math.max(1, Math.round(durationMs / 1000))}s`;
  return costUsd === null ? seconds : `$${costUsd.toFixed(2)} · ${seconds}`;
};

const append = (chat: Chat, entry: ChatEntry): Chat => ({
  ...chat,
  entries: [...chat.entries, entry],
});

const mapEntries = (chat: Chat, f: (entry: ChatEntry) => ChatEntry): Chat => ({
  ...chat,
  entries: chat.entries.map(f),
});

/** Marks the waiting request `requestId` as settled. */
const settle = (
  chat: Chat,
  requestId: string,
  outcome: "allowed" | "denied" | "answered" | "cancelled",
): Chat =>
  mapEntries(chat, (entry) => {
    if (entry.is === "permission" && entry.requestId === requestId) {
      return { ...entry, state: outcome === "answered" ? "allowed" : outcome };
    }
    if (entry.is === "question" && entry.requestId === requestId) {
      return { ...entry, state: outcome === "answered" ? "answered" : "cancelled" };
    }
    return entry;
  });

/**
 * Whether an event in the service's log (shared by every conversation) is this one's.
 * One turn runs at a time, so while this conversation waits on its own turn, events
 * not yet tied to a conversation are its too.
 */
export const isOurs = (chat: Chat, sessionId: string | null): boolean =>
  sessionId === null || chat.sessionId === null ? chat.busy : sessionId === chat.sessionId;

const onEvent = (chat: Chat, event: ChatEvent): Chat => {
  switch (event.is) {
    case "session":
      return { ...chat, sessionId: event.sessionId };
    case "mode":
      return { ...chat, mode: event.mode };
    case "user":
      return append(chat, { is: "user", text: event.text });
    case "text":
      return { ...append(chat, { is: "assistant", text: event.text }), draft: "" };
    case "delta":
      return { ...chat, draft: chat.draft + event.text };
    case "tool":
      return {
        ...append(chat, {
          is: "tool",
          toolUseId: event.toolUseId,
          name: event.name,
          label: event.label,
          input: event.input,
          result: null,
        }),
        // Whatever was being written before the tool call has arrived as text by now.
        draft: "",
      };
    case "tool-result":
      return mapEntries(
        chat,
        (entry) =>
          entry.is === "tool" && entry.toolUseId === event.toolUseId
            ? { ...entry, result: { text: event.text, isError: event.isError } }
            : entry,
      );
    case "permission":
      return append(chat, {
        is: "permission",
        requestId: event.requestId,
        tool: event.tool,
        detail: event.detail,
        canAlways: event.canAlways,
        state: "waiting",
      });
    case "question":
      return append(chat, {
        is: "question",
        requestId: event.requestId,
        questions: event.questions,
        state: "waiting",
      });
    case "settled":
      return settle(chat, event.requestId, event.outcome);
    case "started":
      return { ...chat, busy: true };
    case "usage":
      return {
        ...chat,
        usage: { costUsd: event.costUsd, contextPercent: event.contextPercent, model: event.model },
      };
    case "notice":
      return append(chat, { is: "notice", text: event.text, tone: event.tone });
    case "reload":
      return append(chat, { is: "reload" });
    case "applied":
      return append(chat, { is: "applied" });
    case "rejected":
      return append(chat, { is: "rejected", message: event.message });
    case "error":
      return append(chat, { is: "error", message: event.message });
    case "done":
      return {
        ...append(chat, { is: "summary", text: summaryText(event.costUsd, event.durationMs) }),
        busy: false,
        draft: "",
      };
    default:
      return event satisfies never;
  }
};

export const chatReducer = (chat: Chat, action: ChatAction): Chat => {
  switch (action.is) {
    case "send":
      return {
        ...(action.images === 0
          ? append(chat, { is: "user", text: action.text })
          : append(append(chat, { is: "user", text: action.text }), {
            is: "attachments",
            count: action.images,
          })),
        busy: true,
      };
    case "accepted":
      // The log may already have been read past `after`.
      return {
        ...chat,
        log: action.log,
        seq: chat.log === action.log ? Math.max(chat.seq, action.after) : action.after,
      };
    case "attached":
      return { ...chat, log: action.log, seq: action.after };
    case "event": {
      const { logged } = action;
      const ours = isOurs(chat, logged.sessionId);
      // Transient events (streamed text) aren't numbered on their own.
      if (logged.transient) return ours ? onEvent(chat, logged.event) : chat;
      // Already seen (e.g. a reconnect overlapping what came before).
      if (logged.seq <= chat.seq) return chat;
      return { ...(ours ? onEvent(chat, logged.event) : chat), seq: logged.seq };
    }
    case "failed":
      return { ...append(chat, { is: "error", message: action.message }), busy: false, draft: "" };
    case "warning":
      return append(chat, { is: "error", message: action.message });
    case "mode":
      return { ...chat, mode: action.mode };
    case "model":
      return { ...chat, model: action.model };
    // The model chosen is the service's, for every conversation from now on: it stays.
    case "history":
      return {
        ...action.events.reduce(onEvent, emptyChat),
        sessionId: action.sessionId,
        model: chat.model,
      };
    case "reset":
      return { ...emptyChat, model: chat.model };
    default:
      return action satisfies never;
  }
};

/** The entries of a chat that are still waiting on the user. */
export const waitingOnUser = (chat: Chat): boolean =>
  chat.entries.some((e) => (e.is === "permission" || e.is === "question") && e.state === "waiting");

const SavedEntry = Schema.Union(
  Schema.Struct({ is: Schema.Literal("user", "assistant", "summary"), text: Schema.String }),
  Schema.Struct({ is: Schema.Literal("attachments"), count: Schema.Number }),
  Schema.Struct({
    is: Schema.Literal("tool"),
    toolUseId: Schema.String,
    name: Schema.String,
    label: Schema.String,
    input: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    result: Schema.NullOr(Schema.Struct({ text: Schema.String, isError: Schema.Boolean })),
  }),
  Schema.Struct({
    is: Schema.Literal("permission"),
    requestId: Schema.String,
    tool: Schema.String,
    detail: Schema.String,
    canAlways: Schema.Boolean,
    state: Schema.Literal("waiting", "allowed", "denied", "cancelled"),
  }),
  Schema.Struct({
    is: Schema.Literal("question"),
    requestId: Schema.String,
    questions: Schema.Array(Question),
    state: Schema.Literal("waiting", "answered", "cancelled"),
  }),
  Schema.Struct({ is: Schema.Literal("applied", "reload") }),
  Schema.Struct({ is: Schema.Literal("rejected", "error"), message: Schema.String }),
  Schema.Struct({
    is: Schema.Literal("notice"),
    text: Schema.String,
    tone: Schema.Literal("info", "success", "error"),
  }),
);

/** A saved entry, or null for one this version can't show (e.g. from an older one). */
const decodeEntry = (raw: unknown): ChatEntry | null =>
  Either.getOrNull(Schema.decodeUnknownEither(SavedEntry)(raw));

/** A chat as kept in browser storage, so the conversation survives a reload. */
const SavedChat = Schema.parseJson(Schema.Struct({
  sessionId: Schema.NullOr(Schema.String),
  entries: Schema.Array(Schema.Unknown),
  busy: Schema.Boolean,
  // Chats saved before the service kept a log have none; they can't resume a turn.
  log: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  seq: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  mode: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  model: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
  usage: Schema.optionalWith(
    Schema.NullOr(Schema.Struct({
      costUsd: Schema.NullOr(Schema.Number),
      contextPercent: Schema.NullOr(Schema.Number),
      model: Schema.NullOr(Schema.String),
    })),
    { default: () => null },
  ),
}));

export const saveChat = (chat: Chat): string => {
  const { draft: _, ...saved } = chat;
  return JSON.stringify(saved);
};

/**
 * The chat saved by saveChat, or an empty one if nothing usable was saved. A turn
 * that was in progress carries on: the client follows the log from where it was.
 * One saved without a log position can't, so it's marked as cut off.
 */
export const restoreChat = (saved: string | null): Chat => {
  if (saved === null) return emptyChat;
  const decoded = Schema.decodeUnknownEither(SavedChat)(saved);
  if (Either.isLeft(decoded)) return emptyChat;
  const entries = decoded.right.entries.flatMap((e) => {
    const entry = decodeEntry(e);
    return entry === null ? [] : [entry];
  });
  const chat: Chat = { ...decoded.right, entries, draft: "" };
  return chat.busy && chat.log === null
    ? append({ ...chat, busy: false }, {
      is: "error",
      message: "The page was reloaded before this reply finished.",
    })
    : chat;
};
