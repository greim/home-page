/**
 * Runs one of a widget's AI agents (declared under `agents` in its manifest) on the
 * assistant service, and decodes the answer with the agent's output schema. The
 * agent has no tools: it's given the input, and answers. See the `widget-agents`
 * skill.
 */
import { Either, Schema } from "effect";
import { assistantPortMetaName } from "../../common/assistant.ts";

export type AgentResult<A> =
  | { readonly ok: true; readonly value: A; readonly costUsd: number }
  | { readonly ok: false; readonly errorMessage: string };

/** Where an agent runs: the assistant service's port, on the host the page was loaded from. */
export const agentUrl = (
  page: { readonly protocol: string; readonly hostname: string },
  port: string,
  widgetType: string,
  agentName: string,
): string =>
  `${page.protocol}//${page.hostname}:${port}/api/widget-agents/${encodeURIComponent(widgetType)}/${
    encodeURIComponent(agentName)
  }`;

const Answer = Schema.parseJson(Schema.Struct({ output: Schema.Unknown, costUsd: Schema.Number }));

/** What the service's response comes to, the agent's answer decoded with `output`. */
export const readAgentResponse = <A, I>(
  status: number,
  body: string,
  output: Schema.Schema<A, I>,
): AgentResult<A> => {
  if (status !== 200) {
    return { ok: false, errorMessage: body.trim() || `The assistant service answered ${status}.` };
  }
  const answer = Schema.decodeUnknownEither(Answer)(body);
  if (Either.isLeft(answer)) {
    return { ok: false, errorMessage: "The assistant service's answer wasn't understood." };
  }
  const value = Schema.decodeUnknownEither(output)(answer.right.output);
  return Either.isRight(value)
    ? { ok: true, value: value.right, costUsd: answer.right.costUsd }
    : { ok: false, errorMessage: `The agent's answer didn't fit: ${value.left.message}` };
};

/**
 * Runs widget `widgetType`'s agent `agentName` on `input` (any JSON), and decodes its
 * answer with `output`, the schema its manifest declares. Never rejects.
 */
export const runWidgetAgent = async <A, I>(
  widgetType: string,
  agentName: string,
  input: unknown,
  output: Schema.Schema<A, I>,
): Promise<AgentResult<A>> => {
  const port = document.querySelector(`meta[name="${assistantPortMetaName}"]`)
    ?.getAttribute("content") ?? "";
  try {
    const response = await fetch(agentUrl(location, port, widgetType, agentName), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    return readAgentResponse(response.status, await response.text(), output);
  } catch (cause) {
    return { ok: false, errorMessage: `Couldn't reach the assistant service: ${String(cause)}` };
  }
};
