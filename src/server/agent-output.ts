/**
 * Reads the admin assistant agent's output: Claude Code's `--output-format
 * stream-json`, one JSON object per line. Only the parts the chat needs are
 * decoded; every other line, and anything unrecognized, is ignored.
 */
import { Option, Schema } from "effect";

/** What one line of agent output tells us. */
export type AgentSignal =
  | { is: "session"; sessionId: string }
  | { is: "text"; text: string }
  | { is: "activity"; label: string }
  | { is: "result"; ok: boolean; message: string; costUsd: number | null };

const Init = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: Schema.String,
});

const TextBlock = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const ToolUseBlock = Schema.Struct({
  type: Schema.Literal("tool_use"),
  name: Schema.String,
  input: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

/** Thinking and any other block types the chat doesn't show. */
const OtherBlock = Schema.Struct({ type: Schema.String });

const AssistantMessage = Schema.Struct({
  type: Schema.Literal("assistant"),
  message: Schema.Struct({
    content: Schema.Array(Schema.Union(TextBlock, ToolUseBlock, OtherBlock)),
  }),
});

const Result = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String,
  is_error: Schema.Boolean,
  /** Absent on some error subtypes. */
  result: Schema.optionalWith(Schema.String, { default: () => "" }),
  total_cost_usd: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
});

const AgentLine = Schema.Union(Init, AssistantMessage, Result);

const parseJson = (line: string): Option.Option<unknown> =>
  Option.liftThrowable((): unknown => JSON.parse(line))();

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** A short, human description of a tool call, for the chat's activity lines. */
export const activityLabel = (name: string, input: Readonly<Record<string, unknown>>): string => {
  const field = (key: string): string => {
    const value: unknown = input[key];
    return typeof value === "string" ? value : "?";
  };
  switch (name) {
    case "mcp__unibrain__unibrain_search":
      return `Searching Unibrain for “${field("query")}”`;
    case "mcp__unibrain__unibrain_read":
      return `Reading Unibrain resource ${field("id")}`;
    case "mcp__unibrain__unibrain_create":
      return `Saving to Unibrain: ${field("description")}`;
    case "mcp__unibrain__unibrain_write":
      return `Updating Unibrain resource ${field("id")}`;
    case "mcp__unibrain__unibrain_rate":
      return `Rating Unibrain resource ${field("id")}`;
    case "mcp__unibrain__unibrain_delete":
      return `Deleting Unibrain resource ${field("id")}`;
    case "mcp__unibrain__unibrain_safe_execute":
    case "mcp__unibrain__unibrain_execute":
      return `Running Unibrain program ${field("id")}`;
    case "Read":
      return `Reading ${baseName(field("file_path"))}`;
    case "Edit":
    case "Write":
      return `Editing ${baseName(field("file_path"))}`;
    case "Glob":
      return `Looking for files matching ${field("pattern")}`;
    case "Grep":
      return `Searching files for “${field("pattern")}”`;
    default:
      return `Using ${name}`;
  }
};

const blockSignals = (
  block: typeof AssistantMessage.Type["message"]["content"][number],
): ReadonlyArray<AgentSignal> => {
  if ("text" in block) {
    return block.text.trim() === "" ? [] : [{ is: "text", text: block.text.trim() }];
  }
  if ("name" in block) {
    return [{ is: "activity", label: activityLabel(block.name, block.input) }];
  }
  return [];
};

/** What a line of agent output means for the chat; empty for lines it doesn't care about. */
export const parseAgentLine = (line: string): ReadonlyArray<AgentSignal> => {
  const decoded = parseJson(line).pipe(
    Option.flatMap((json) => Schema.decodeUnknownOption(AgentLine)(json)),
  );
  if (Option.isNone(decoded)) {
    return [];
  }
  const event = decoded.value;
  switch (event.type) {
    case "system":
      return [{ is: "session", sessionId: event.session_id }];
    case "assistant":
      return event.message.content.flatMap(blockSignals);
    case "result":
      return [{
        is: "result",
        ok: !event.is_error && event.subtype === "success",
        message: event.result.trim() === "" ? event.subtype : event.result,
        costUsd: event.total_cost_usd,
      }];
    default:
      return event satisfies never;
  }
};
