/**
 * A widget's own agent tools: functions its agent can call, written in the widget's
 * `agent-tools.ts`, exported as `tools`. They run in Deno, in a process of their own
 * that may read and write only the run's folder and has no network. They're never in
 * the page's bundle. See the `widget-agents` skill.
 *
 *   export const tools = defineAgentTools({
 *     sheet_overview: agentTool({
 *       description: "Headers, row count and a sample of the sheet",
 *       input: Schema.Struct({ file: Schema.String }),
 *       run: async ({ file }, run) => overview(await Deno.readTextFile(run.path(`in/${file}`))),
 *     }),
 *   });
 */
import type { Schema } from "effect";

/** The run's folder, as a tool sees it. */
export type RunFolder = {
  /** The folder's absolute path. */
  readonly dir: string;
  /** A path inside the folder, from one relative to it (e.g. "in/sheet.csv"); throws if it leaves it. */
  readonly path: (relative: string) => string;
};

export type AgentTool<A, I> = {
  /** What it does, for the agent. */
  readonly description: string;
  /** What it takes. Described to the agent as JSON Schema. */
  readonly input: Schema.Schema<A, I>;
  /** Does the work; what it returns (text, or anything JSON) is the agent's result. */
  readonly run: (input: A, folder: RunFolder) => Promise<unknown>;
};

// deno-lint-ignore no-explicit-any
export type AgentTools = Readonly<Record<string, AgentTool<any, any>>>;

/** Declares a widget's agent tools, checking their shapes. */
export const defineAgentTools = <T extends AgentTools>(tools: T): T => tools;

/** Declares one tool, so `run`'s input is typed by `input`'s schema. */
export const agentTool = <A, I>(tool: AgentTool<A, I>): AgentTool<A, I> => tool;
