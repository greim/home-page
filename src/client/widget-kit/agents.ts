/**
 * Runs one of this widget's AI agents (declared under `agents` in its manifest) to its
 * answer, decoded with the agent's output schema: for agents that never ask and take
 * no files, like the grammar checker. Built on the agent-runs widget API; for runs
 * that ask, or take files, use `useAgentRun`. See the `widget-agents` skill.
 */
import { Either, Schema } from "effect";
import { useCallback } from "react";
import { agentRunsApi } from "../../common/apis/agent-runs.ts";
import type { ApiResult } from "../../common/widget-apis.ts";
import type { AgentInput } from "./agent-run.ts";
import { useWidgetApi } from "./apis.tsx";

export type AgentResult<A> =
  | { readonly ok: true; readonly value: A; readonly costUsd: number }
  | { readonly ok: false; readonly errorMessage: string };

/** What the API's answer comes to, the agent's answer decoded with `output`. */
export const readAgentResult = <A, I>(
  result: ApiResult<
    { readonly output: unknown; readonly costUsd: number },
    { readonly message: string }
  >,
  output: Schema.Schema<A, I>,
): AgentResult<A> => {
  if (!result.ok) return { ok: false, errorMessage: result.error.message };
  const value = Schema.decodeUnknownEither(output)(result.value.output);
  return Either.isRight(value)
    ? { ok: true, value: value.right, costUsd: result.value.costUsd }
    : { ok: false, errorMessage: `The agent's answer didn't fit: ${value.left.message}` };
};

/**
 * A function that runs this widget's agent `agentName` on `input` (any JSON), and
 * decodes its answer with `output`, the schema its manifest declares. Never rejects.
 */
export const useWidgetAgent = <A, I>(agentName: string, output: Schema.Schema<A, I>) => {
  const runs = useWidgetApi(agentRunsApi);
  return useCallback(
    async (input: AgentInput): Promise<AgentResult<A>> =>
      readAgentResult(await runs.run({ agent: agentName, input }), output),
    [runs, agentName, output],
  );
};
