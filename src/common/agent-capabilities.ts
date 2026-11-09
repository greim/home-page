/**
 * What a widget agent may do beyond answering: its capabilities, each declared in
 * the widget's manifest with a policy, `auto` (used without asking) or `ask` (the
 * user allows each use, in the widget). Anything not declared is unavailable to it.
 *
 * Each capability is also judged by what it touches: whether it reads private data or
 * untrusted content, and whether it can send data off the machine. An agent that has
 * all three (private data, untrusted content, and an auto-allowed way out) could be
 * steered by the untrusted content into sending the private data somewhere, so the
 * widget build refuses it (`riskyCombination`).
 */
import { Schema } from "effect";

export const Policy = Schema.Literal("auto", "ask");
export type Policy = typeof Policy.Type;

/** Lowercase letters, digits and single hyphens or underscores, e.g. an MCP server's name. */
const Name = Schema.String.pipe(Schema.pattern(/^[a-z0-9]+([-_][a-z0-9]+)*$/i));

/** The name the agent's MCP server of widget tools has: no `mcp` capability may use it. */
export const widgetToolsServer = "widget";

export const Capability = Schema.Union(
  /** Web search (done by Anthropic): untrusted results; the queries go out. */
  Schema.Struct({ use: Schema.Literal("web-search"), policy: Policy }),
  /** Fetching a web page the agent chooses: untrusted content; the URL goes out. */
  Schema.Struct({ use: Schema.Literal("web-fetch"), policy: Policy }),
  /**
   * The run's own folder: the files the user gives it (in `in/`), and files it writes for
   * the user to download (in `out/`). Never anything else on the machine.
   */
  Schema.Struct({ use: Schema.Literal("files") }),
  /**
   * The widget's own tools, from its `agent-tools.ts`. They run in a Deno process that may
   * read and write only the run's folder, with no network.
   */
  Schema.Struct({
    use: Schema.Literal("widget-tools"),
    policy: Policy,
    /** What they do, in plain words, for the consent form. */
    does: Schema.NonEmptyTrimmedString,
  }),
  /** Tools of an MCP server the user has configured in Claude Code. */
  Schema.Struct({
    use: Schema.Literal("mcp"),
    /** The server's name in the user's Claude Code config. */
    server: Name.pipe(Schema.filter((name) => name !== widgetToolsServer, {
      message: () => `"${widgetToolsServer}" is the widget's own tool server's name`,
    })),
    /** The server's tools the agent may use. */
    tools: Schema.NonEmptyArray(Name),
    policy: Policy,
    /** The service it reaches: must be listed under the manifest's `permissions`. */
    service: Schema.NonEmptyTrimmedString,
    /** What it reads: the user's own data, content anyone could have written, or neither. */
    reads: Schema.Literal("private", "untrusted", "public"),
    /** Whether it can send data anywhere: post, email, create something others see. */
    sends: Schema.Boolean,
    /** What it does, in plain words, for the consent form. */
    does: Schema.NonEmptyTrimmedString,
  }),
);
export type Capability = typeof Capability.Type;

/** What the agent's input holds. Unless an agent says otherwise, it may be both. */
export const InputTraits = Schema.Struct({
  /** It holds the user's own data. */
  private: Schema.Boolean,
  /** It may hold content written by others (a pasted email, a downloaded file). */
  untrusted: Schema.Boolean,
});
export type InputTraits = typeof InputTraits.Type;

export const defaultInputTraits: InputTraits = { private: true, untrusted: true };

/** The built-in Claude Code tools for working in the run's folder. */
export const fileTools: ReadonlyArray<string> = ["Read", "Write", "Edit", "Glob", "Grep"];

/** What a capability touches and gives the agent. */
export type Traits = {
  readonly reads: "private" | "untrusted" | "public";
  readonly sends: boolean;
  /** Used without asking. */
  readonly auto: boolean;
  /** The built-in tools it enables; MCP tools aren't built in. */
  readonly builtIn: ReadonlyArray<string>;
  /** The tool names it allows, as Claude Code names them, e.g. `mcp__gmail__search`. */
  readonly toolNames: ReadonlyArray<string>;
  /** What it does, in plain words, for the consent form. */
  readonly does: string;
};

export const traits = (capability: Capability): Traits => {
  switch (capability.use) {
    case "web-search":
      return {
        reads: "untrusted",
        sends: true,
        auto: capability.policy === "auto",
        builtIn: ["WebSearch"],
        toolNames: ["WebSearch"],
        does: "Searches the web",
      };
    case "web-fetch":
      return {
        reads: "untrusted",
        sends: true,
        auto: capability.policy === "auto",
        builtIn: ["WebFetch"],
        toolNames: ["WebFetch"],
        does: "Reads web pages it chooses",
      };
    case "files":
      return {
        reads: "private",
        sends: false,
        auto: true,
        builtIn: fileTools,
        toolNames: fileTools,
        does: "Reads the files you give it, and writes files for you to download",
      };
    case "widget-tools":
      return {
        // They work on the run's folder, which holds the user's files.
        reads: "private",
        sends: false,
        auto: capability.policy === "auto",
        builtIn: [],
        toolNames: [`mcp__${widgetToolsServer}__*`],
        does: capability.does,
      };
    case "mcp":
      return {
        reads: capability.reads,
        sends: capability.sends,
        auto: capability.policy === "auto",
        builtIn: [],
        toolNames: capability.tools.map((tool) => `mcp__${capability.server}__${tool}`),
        does: capability.does,
      };
    default:
      return capability satisfies never;
  }
};

/** Whether a tool name (as Claude Code names it) is one of a capability's. */
export const grants = (capability: Capability, toolName: string): boolean =>
  traits(capability).toolNames.some((name) =>
    name.endsWith("*") ? toolName.startsWith(name.slice(0, -1)) : toolName === name
  );

/**
 * Why an agent is too risky to build, or null if it isn't: it has private data and
 * untrusted content, and some capability that sends data out without asking.
 */
export const riskyCombination = (
  input: InputTraits,
  capabilities: ReadonlyArray<Capability>,
): string | null => {
  const all = capabilities.map(traits);
  const hasPrivate = input.private || all.some((t) => t.reads === "private");
  const hasUntrusted = input.untrusted || all.some((t) => t.reads === "untrusted");
  const autoOut = all.filter((t) => t.sends && t.auto);
  if (!hasPrivate || !hasUntrusted || autoOut.length === 0) return null;
  return `it reads private data and untrusted content, so it can't send anything out without ` +
    `asking: make these "ask", or leave them out: ${autoOut.map((t) => t.does).join("; ")}`;
};
