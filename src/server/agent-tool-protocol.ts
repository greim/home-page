/**
 * The MCP protocol, as much of it as a server of a widget's agent tools needs: JSON-RPC
 * 2.0 messages, one per line, for `initialize`, `tools/list` and `tools/call`. This is
 * the functional core; agent-tool-server.ts reads and writes the lines and runs tools.
 */
import { Effect, JSONSchema, Schema } from "effect";

/** A tool, as the agent is told about it. */
export type ListedTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
};

/**
 * A tool's input, as JSON Schema for the agent. MCP needs an object schema, but Effect
 * gives an empty struct (a tool that takes nothing) as "any object or array", which
 * Claude Code refuses, along with the server's other tools: that's made a plain object.
 */
export const inputSchemaOf = (input: Schema.Schema.Any): unknown => {
  const schema = JSONSchema.make(input);
  return "anyOf" in schema && !("type" in schema)
    ? { $schema: schema.$schema, type: "object", properties: {} }
    : schema;
};

/** What a tool call came to: text for the agent, and whether it failed. */
export type CallResult = { readonly text: string; readonly isError: boolean };

const Request = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optional(Schema.Union(Schema.String, Schema.Number)),
  method: Schema.String,
  params: Schema.optional(Schema.Unknown),
});

const CallParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optionalWith(Schema.Unknown, { default: () => ({}) }),
});

const InitializeParams = Schema.Struct({ protocolVersion: Schema.optional(Schema.String) });

/** The protocol version, when the client doesn't say which it speaks. */
const defaultVersion = "2025-06-18";

const reply = (id: string | number, result: unknown) => ({ jsonrpc: "2.0", id, result });
const error = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/**
 * The response to one message (a line, parsed), or null for a notification (no `id`),
 * which gets none. `call` runs a tool by name with its arguments.
 */
export const handleMessage = (
  message: unknown,
  tools: ReadonlyArray<ListedTool>,
  call: (name: string, args: unknown) => Effect.Effect<CallResult>,
): Effect.Effect<unknown | null> =>
  Effect.gen(function* () {
    const decoded = Schema.decodeUnknownEither(Request)(message);
    if (decoded._tag === "Left") return error(null, -32600, "Invalid request");
    const { id, method, params } = decoded.right;
    if (id === undefined) return null;
    switch (method) {
      case "initialize": {
        const asked = Schema.decodeUnknownOption(InitializeParams)(params ?? {});
        return reply(id, {
          protocolVersion: asked._tag === "Some" && asked.value.protocolVersion !== undefined
            ? asked.value.protocolVersion
            : defaultVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "widget-tools", version: "1" },
        });
      }
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools });
      case "tools/call": {
        const callParams = Schema.decodeUnknownEither(CallParams)(params);
        if (callParams._tag === "Left") return error(id, -32602, "Invalid tool call");
        const { name } = callParams.right;
        if (!tools.some((t) => t.name === name)) {
          return error(id, -32602, `There's no tool called "${name}"`);
        }
        const result = yield* call(name, callParams.right.arguments);
        return reply(id, {
          content: [{ type: "text", text: result.text }],
          ...(result.isError ? { isError: true } : {}),
        });
      }
      default:
        return error(id, -32601, `Unknown method: ${method}`);
    }
  });

/** A tool's result, as text for the agent: text as it is, anything else as JSON. */
export const resultText = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
