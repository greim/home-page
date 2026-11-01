/**
 * The admin assistant's wire format, shared by client and server: what the
 * client sends to start a turn, and the events the server streams back while
 * the agent works (one JSON object per line).
 */
import { Schema } from "effect";
import { Layout } from "./model.ts";

export const AssistantRequest = Schema.Struct({
  message: Schema.String.pipe(Schema.minLength(1)),
  /** The agent's session to continue; null starts a new conversation. */
  sessionId: Schema.NullOr(Schema.String),
  /**
   * A JPEG of the page as the user saw it when they sent the message (base64 on
   * the wire), so the agent can see what it's styling; null if it couldn't be taken.
   */
  screenshot: Schema.NullOr(Schema.Uint8ArrayFromBase64),
});
export type AssistantRequest = typeof AssistantRequest.Type;

export const ChatEvent = Schema.Union(
  /** The conversation's id, to send back with the next message. */
  Schema.Struct({ is: Schema.Literal("session"), sessionId: Schema.String }),
  /** Something the agent said to the user. */
  Schema.Struct({ is: Schema.Literal("text"), text: Schema.String }),
  /** A short description of a tool the agent is using. */
  Schema.Struct({ is: Schema.Literal("activity"), label: Schema.String }),
  /** The agent's edited layout was validated and is now live. */
  Schema.Struct({ is: Schema.Literal("applied"), layout: Layout }),
  /** The agent's edited layout was rejected; the agent has been told why and is retrying. */
  Schema.Struct({ is: Schema.Literal("rejected"), message: Schema.String }),
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
