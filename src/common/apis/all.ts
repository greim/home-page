/**
 * Every widget API, by name. Add a new API's definition here, then serve it (see
 * the `widget-apis` skill). The build checks manifests' `apis` against this list.
 */
import type { AnyApi } from "../widget-apis.ts";
import { agentRunsApi } from "./agent-runs.ts";
import { layoutApi } from "./layout.ts";

export const allApis: ReadonlyArray<AnyApi> = [agentRunsApi, layoutApi];

/** The API every widget with agents gets, without declaring it. */
export const agentsApiName = agentRunsApi.name;

export const findApi = (name: string): AnyApi | undefined => allApis.find((a) => a.name === name);
