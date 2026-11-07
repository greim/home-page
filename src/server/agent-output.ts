/**
 * Reads the agent's output: the messages the Agent SDK yields, live or from a
 * saved session's transcript. Only the parts the chat needs are decoded; every
 * other message, and anything unrecognized, is ignored. A subagent's messages
 * are left out: the chat shows the tool call that started it instead.
 */
import { Option, Schema } from "effect";
import { appMessagePrefix, appNotePrefix } from "./assistant-agent.ts";

/** What one agent message tells us. */
export type AgentSignal =
  | { is: "session"; sessionId: string }
  | { is: "mode"; mode: string }
  | { is: "user"; text: string }
  | { is: "text"; text: string }
  | { is: "delta"; text: string }
  | {
    is: "tool";
    toolUseId: string;
    name: string;
    label: string;
    input: Readonly<Record<string, unknown>>;
  }
  | { is: "tool-result"; toolUseId: string; text: string; isError: boolean }
  | { is: "result"; ok: boolean; message: string; costUsd: number | null };

/** Longest a tool's input string or result gets, so a huge file can't flood the chat. */
export const maxToolText = 20_000;

const clip = (text: string): string =>
  text.length > maxToolText ? `${text.slice(0, maxToolText)}…` : text;

/** Null for messages from the main agent; a subagent's carry the id of the tool call that ran it. */
const Parent = Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null });

const Init = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
  permissionMode: Schema.optional(Schema.String),
});

const Status = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("status"),
  permissionMode: Schema.String,
});

const TextBlock = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const ToolUseBlock = Schema.Struct({
  type: Schema.Literal("tool_use"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

/** Images and any other block types the chat shows only by their type. */
const OtherBlock = Schema.Struct({ type: Schema.String });

const ToolResultBlock = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  content: Schema.optionalWith(
    Schema.Union(Schema.String, Schema.Array(Schema.Union(TextBlock, OtherBlock))),
    { default: () => "" },
  ),
  is_error: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});

const AssistantMessage = Schema.Struct({
  type: Schema.Literal("assistant"),
  parent_tool_use_id: Parent,
  message: Schema.Struct({
    content: Schema.Array(Schema.Union(TextBlock, ToolUseBlock, OtherBlock)),
  }),
});

const UserMessage = Schema.Struct({
  type: Schema.Literal("user"),
  parent_tool_use_id: Parent,
  message: Schema.Struct({
    content: Schema.Union(
      Schema.String,
      Schema.Array(Schema.Union(TextBlock, ToolResultBlock, OtherBlock)),
    ),
  }),
});

const TextDelta = Schema.Struct({
  type: Schema.Literal("stream_event"),
  parent_tool_use_id: Parent,
  event: Schema.Struct({
    type: Schema.Literal("content_block_delta"),
    delta: Schema.Struct({ type: Schema.Literal("text_delta"), text: Schema.String }),
  }),
});

const Result = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  is_error: Schema.Boolean,
  /** Absent on error subtypes. */
  result: Schema.optionalWith(Schema.String, { default: () => "" }),
  total_cost_usd: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
});

const AgentMessage = Schema.Union(
  Init,
  Status,
  AssistantMessage,
  UserMessage,
  TextDelta,
  Result,
);

/** A path inside `root` relative to it, else as is. */
const relativeTo = (root: string, path: string): string => {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
};

/** A short, human description of a tool call, for the chat's activity lines. */
export const activityLabel = (
  root: string,
  name: string,
  input: Readonly<Record<string, unknown>>,
): string => {
  const field = (key: string): string => {
    const value: unknown = input[key];
    return typeof value === "string" ? value : "?";
  };
  switch (name) {
    case "WebSearch":
      return `Searching the web for “${field("query")}”`;
    case "WebFetch":
      return `Reading ${field("url")}`;
    case "Read":
      return `Reading ${relativeTo(root, field("file_path"))}`;
    case "Edit":
    case "Write":
      return `Editing ${relativeTo(root, field("file_path"))}`;
    case "Glob":
      return `Looking for files matching ${field("pattern")}`;
    case "Grep":
      return `Searching files for “${field("pattern")}”`;
    case "Bash":
      return typeof input["description"] === "string"
        ? `Running: ${input["description"]}`
        : `Running ${field("command")}`;
    default:
      return `Using ${name}`;
  }
};

const resultMessage = (subtype: string, result: string): string => {
  if (result.trim() !== "") return result;
  switch (subtype) {
    case "error_during_execution":
      return "The assistant stopped before finishing.";
    case "error_max_turns":
      return "The assistant took too many steps and stopped.";
    default:
      return subtype;
  }
};

/** A tool's input with any long strings clipped. */
const clipInput = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, typeof v === "string" ? clip(v) : v]),
  );

/** A tool result's text: its text blocks, or a note for anything else (e.g. an image). */
const resultText = (content: string | ReadonlyArray<{ readonly type: string }>): string =>
  typeof content === "string"
    ? content
    : content.map((block) =>
      "text" in block && typeof block.text === "string" ? block.text : `[${block.type}]`
    ).join("\n");

/**
 * What the user typed, without the notes the app put before it ("[app note] ..." lines,
 * then a blank line); null for the app's own messages to the agent ("[app] ...").
 */
export const userText = (text: string): string | null => {
  if (text.startsWith(appMessagePrefix)) return null;
  if (!text.startsWith(appNotePrefix)) return text.trim() === "" ? null : text;
  const ownAt = text.indexOf("\n\n");
  const own = ownAt === -1 ? "" : text.slice(ownAt + 2);
  return own.trim() === "" ? null : own;
};

type AssistantBlock = typeof AssistantMessage.Type["message"]["content"][number];
type UserBlock = Exclude<typeof UserMessage.Type["message"]["content"], string>[number];

const assistantSignals = (root: string) => (block: AssistantBlock): ReadonlyArray<AgentSignal> => {
  if ("text" in block) {
    return block.text.trim() === "" ? [] : [{ is: "text", text: block.text.trim() }];
  }
  if ("name" in block) {
    return [{
      is: "tool",
      toolUseId: block.id,
      name: block.name,
      label: activityLabel(root, block.name, block.input),
      input: clipInput(block.input),
    }];
  }
  return [];
};

const userSignals = (history: boolean) => (block: UserBlock): ReadonlyArray<AgentSignal> => {
  if ("tool_use_id" in block) {
    return [{
      is: "tool-result",
      toolUseId: block.tool_use_id,
      text: clip(resultText(block.content)),
      isError: block.is_error,
    }];
  }
  if (history && "text" in block) {
    const text = userText(block.text);
    return text === null ? [] : [{ is: "user", text }];
  }
  return [];
};

/**
 * What an agent message means for the chat; empty for messages it doesn't care
 * about. File paths in tool labels are shown relative to `root`. In a saved
 * transcript (`history`), the user's own messages are included too; live, the
 * client already shows what it sent.
 */
export const parseAgentMessage = (
  root: string,
  message: unknown,
  history = false,
): ReadonlyArray<AgentSignal> => {
  const decoded = Schema.decodeUnknownOption(AgentMessage)(message);
  if (Option.isNone(decoded)) {
    return [];
  }
  const event = decoded.value;
  switch (event.type) {
    case "system":
      if (event.subtype === "status") return [{ is: "mode", mode: event.permissionMode }];
      return [
        { is: "session", sessionId: event.session_id },
        ...(event.permissionMode === undefined
          ? []
          : [{ is: "mode", mode: event.permissionMode } as const]),
      ];
    case "assistant":
      return event.parent_tool_use_id === null
        ? event.message.content.flatMap(assistantSignals(root))
        : [];
    case "user": {
      if (event.parent_tool_use_id !== null) return [];
      const content = event.message.content;
      if (typeof content === "string") {
        const text = history ? userText(content) : null;
        return text === null ? [] : [{ is: "user", text }];
      }
      return content.flatMap(userSignals(history));
    }
    case "stream_event":
      return event.parent_tool_use_id === null
        ? [{ is: "delta", text: event.event.delta.text }]
        : [];
    case "result":
      return [{
        is: "result",
        ok: !event.is_error && event.subtype === "success",
        message: resultMessage(event.subtype, event.result),
        costUsd: event.total_cost_usd,
      }];
    default:
      return event satisfies never;
  }
};

/**
 * A saved session's transcript, as the chat events that replay it. Saved messages
 * have their role in `type` and their content in `message`, like live ones.
 */
export const historySignals = (
  root: string,
  messages: ReadonlyArray<unknown>,
): ReadonlyArray<AgentSignal> =>
  messages.flatMap((m) => parseAgentMessage(root, m, true)).filter((s) =>
    s.is !== "session" && s.is !== "mode" && s.is !== "result" && s.is !== "delta"
  );
