/**
 * The assistant service's wire format, shared by client and server: what the
 * client sends (a message, an answer to a permission request or question), and
 * the numbered events the service logs while the agent works. Clients read the
 * log from any point, so a reload or dropped connection never loses a turn.
 */
import { Schema } from "effect";
import { Layout } from "./model.ts";

/** The `<meta>` in the page that tells the client the assistant service's port. */
export const assistantPortMetaName = "assistant-port";

/** The image types Claude reads. */
export const ImageType = Schema.Literal("image/png", "image/jpeg", "image/gif", "image/webp");
export type ImageType = typeof ImageType.Type;

/** Largest image the user may attach, as Claude accepts it. */
export const maxImageBytes = 5 * 1024 * 1024;

/** An image the user attached to a message (base64 on the wire). */
export const AttachedImage = Schema.Struct({
  mediaType: ImageType,
  data: Schema.Uint8ArrayFromBase64.pipe(
    Schema.filter((bytes) =>
      bytes.length <= maxImageBytes || `An image may be at most ${maxImageBytes} bytes`
    ),
  ),
});
export type AttachedImage = typeof AttachedImage.Type;

export const SendMessage = Schema.Struct({
  message: Schema.String.pipe(Schema.minLength(1)),
  /** The agent's session to continue; null starts a new conversation. */
  sessionId: Schema.NullOr(Schema.String),
  /**
   * A JPEG of the page as the user saw it when they sent the message (base64 on
   * the wire), so the agent can see what it's styling; null if it couldn't be taken.
   */
  screenshot: Schema.NullOr(Schema.Uint8ArrayFromBase64),
  /** Images the user pasted or dropped in. */
  images: Schema.optionalWith(Schema.Array(AttachedImage), { default: () => [] }),
});
export type SendMessage = typeof SendMessage.Type;

/**
 * The service accepted a message: the turn's events are the ones in log `log` numbered
 * after `after`. Each run of the service keeps a new log.
 */
export const SendAccepted = Schema.Struct({ log: Schema.String, after: Schema.Number });
export type SendAccepted = typeof SendAccepted.Type;

/** One question the agent asks with its AskUserQuestion tool. */
export const Question = Schema.Struct({
  question: Schema.String,
  /** A very short label for the question. */
  header: Schema.String,
  multiSelect: Schema.Boolean,
  options: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String })),
});
export type Question = typeof Question.Type;

/** How the user answers a permission request. "always" also saves the SDK's suggested rule. */
export const PermissionChoice = Schema.Literal(
  "allow",
  "always",
  "deny",
  /** For a plan (ExitPlanMode): approve it, and accept the edits that carry it out. */
  "accept-edits",
);
export type PermissionChoice = typeof PermissionChoice.Type;

export const Answer = Schema.Union(
  Schema.Struct({ is: Schema.Literal("permission"), choice: PermissionChoice }),
  /** Each question's text, to the label (or comma-separated labels) the user chose. */
  Schema.Struct({
    is: Schema.Literal("question"),
    answers: Schema.Record({ key: Schema.String, value: Schema.String }),
  }),
);
export type Answer = typeof Answer.Type;

/** The permission modes the assistant offers, as Claude Code names them. */
export const PermissionMode = Schema.Literal("default", "acceptEdits", "plan");
export type PermissionMode = typeof PermissionMode.Type;

/** A conversation's permission mode; `sessionId` null for one that hasn't started yet. */
export const SetMode = Schema.Struct({
  mode: PermissionMode,
  sessionId: Schema.NullOr(Schema.String),
});

/** The model to use, by Claude Code's name for it (e.g. "opus"); null for its default. */
export const SetModel = Schema.Struct({ model: Schema.NullOr(Schema.String) });

/** A slash command (or skill) the user can send, e.g. "/compact". */
export const Command = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  /** e.g. "<instructions>", or "" if it takes none. */
  argumentHint: Schema.String,
});
export type Command = typeof Command.Type;

/** A model the user can choose. */
export const ModelChoice = Schema.Struct({
  /** What to set, e.g. "opus" or "default". */
  value: Schema.String,
  displayName: Schema.String,
  description: Schema.String,
});
export type ModelChoice = typeof ModelChoice.Type;

/** What Claude Code offers in this repo: its slash commands and skills, and models. */
export const Capabilities = Schema.Struct({
  commands: Schema.Array(Command),
  models: Schema.Array(ModelChoice),
});
export type Capabilities = typeof Capabilities.Type;

/** Which log the service is keeping now, and the number of its last event. */
export const ServiceState = Schema.Struct({ log: Schema.String, latest: Schema.Number });
export type ServiceState = typeof ServiceState.Type;

/** A past conversation, newest first in a list. */
export const SessionSummary = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.String,
  /** When it last changed, in ms since the epoch. */
  lastModified: Schema.Number,
});
export type SessionSummary = typeof SessionSummary.Type;

export const SessionList = Schema.Struct({ sessions: Schema.Array(SessionSummary) });

export const ChatEvent = Schema.Union(
  /** The conversation's id, to send back with the next message. */
  Schema.Struct({ is: Schema.Literal("session"), sessionId: Schema.String }),
  /** The session's permission mode, when it starts or changes. */
  Schema.Struct({ is: Schema.Literal("mode"), mode: Schema.String }),
  /** Something the user said (only in a past conversation's history). */
  Schema.Struct({ is: Schema.Literal("user"), text: Schema.String }),
  /** Something the agent said to the user. */
  Schema.Struct({ is: Schema.Literal("text"), text: Schema.String }),
  /** More of what the agent is saying, as it writes it. Superseded by the "text" that follows. */
  Schema.Struct({ is: Schema.Literal("delta"), text: Schema.String }),
  /** A tool the agent is using. */
  Schema.Struct({
    is: Schema.Literal("tool"),
    toolUseId: Schema.String,
    name: Schema.String,
    /** A short description, e.g. "Editing src/app.tsx". */
    label: Schema.String,
    /** Its input (as Claude Code gives it, perhaps clipped). */
    input: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  }),
  /** What a tool returned (perhaps clipped). */
  Schema.Struct({
    is: Schema.Literal("tool-result"),
    toolUseId: Schema.String,
    text: Schema.String,
    isError: Schema.Boolean,
  }),
  /** The agent wants to use a tool the user's settings don't allow; it waits for an answer. */
  Schema.Struct({
    is: Schema.Literal("permission"),
    requestId: Schema.String,
    /** e.g. "Bash". */
    tool: Schema.String,
    /** What it wants to do, e.g. the command it would run. */
    detail: Schema.String,
    /** Whether "always" would save a rule (Claude Code suggested one). */
    canAlways: Schema.Boolean,
  }),
  /** The agent asks the user to choose; it waits for an answer. */
  Schema.Struct({
    is: Schema.Literal("question"),
    requestId: Schema.String,
    questions: Schema.Array(Question),
  }),
  /** A permission request or question no longer waits: answered, or the turn moved on. */
  Schema.Struct({
    is: Schema.Literal("settled"),
    requestId: Schema.String,
    outcome: Schema.Literal("allowed", "denied", "answered", "cancelled"),
  }),
  /** The agent's edited layout was validated and is now live. */
  Schema.Struct({ is: Schema.Literal("applied"), layout: Layout }),
  /** The agent's edited layout was rejected; the agent has been told why and is retrying. */
  Schema.Struct({ is: Schema.Literal("rejected"), message: Schema.String }),
  /**
   * The agent began a turn of its own, not in answer to a message (e.g. a background task
   * it started has finished). It ends with "done" like any other.
   */
  Schema.Struct({ is: Schema.Literal("started") }),
  /** What the service is doing about a turn's changes, e.g. restarting the server. */
  Schema.Struct({
    is: Schema.Literal("notice"),
    text: Schema.String,
    tone: Schema.Literal("info", "success", "error"),
  }),
  /** How much the conversation has used, after each of the agent's results. */
  Schema.Struct({
    is: Schema.Literal("usage"),
    /** The conversation's cost so far (including turns before it was resumed). */
    costUsd: Schema.NullOr(Schema.Number),
    /** How full the model's context window is, 0 to 100. */
    contextPercent: Schema.NullOr(Schema.Number),
    model: Schema.NullOr(Schema.String),
  }),
  /** The page's code changed: it should reload to use it. */
  Schema.Struct({ is: Schema.Literal("reload") }),
  /** The turn failed; nothing more will happen until the user sends another message. */
  Schema.Struct({ is: Schema.Literal("error"), message: Schema.String }),
  /** The turn finished. */
  Schema.Struct({
    is: Schema.Literal("done"),
    costUsd: Schema.NullOr(Schema.Number),
    durationMs: Schema.Number,
  }),
);
export type ChatEvent = typeof ChatEvent.Type;

/**
 * An event as logged and streamed: numbered, so a client can resume after the last it saw.
 * A transient one (streamed text) isn't kept: it has the number of the last kept event.
 */
export const LoggedEvent = Schema.Struct({
  seq: Schema.Number,
  event: ChatEvent,
  transient: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  /** The conversation it's part of; null before one has started (e.g. it failed to). */
  sessionId: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
});
export type LoggedEvent = typeof LoggedEvent.Type;

/** A past conversation, as events to replay. */
export const SessionHistory = Schema.Struct({ events: Schema.Array(ChatEvent) });

/** Whether an event ends its turn. */
export const endsTurn = (event: ChatEvent): boolean => event.is === "done";
