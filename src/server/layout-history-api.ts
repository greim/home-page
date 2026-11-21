/**
 * Serves the layout history widget API (src/common/apis/layout-history.ts) from the layout
 * history (layout-history.ts) and the layout store, on the main server.
 */
import { Effect } from "effect";
import { layoutHistoryApi } from "../common/apis/layout-history.ts";
import type { ServerIo } from "./http.ts";
import { type GitFailed, isCommitId, LayoutHistoryService } from "./layout-history.ts";
import { readLayout } from "./layout-store.ts";
import { HandlerFailed, serve, type ServedApi } from "./widget-api-routes.ts";

/** What the handlers need. */
export type LayoutHistoryNeeds = ServerIo | LayoutHistoryService;

const ok = <A>(value: A) => ({ ok: true, value }) as const;

const gitProblem = (e: GitFailed) =>
  Effect.succeed({ ok: false, error: { is: "git-problem", message: e.message } } as const);

/** The live layout, for answering with after it's been changed. */
const liveLayout = readLayout.pipe(
  Effect.catchTags({
    CorruptData: (e) => new HandlerFailed({ message: e.message }),
    IoError: (e) => new HandlerFailed({ message: `Couldn't read the layout: ${e.cause}` }),
  }),
);

/** Runs `use` on the history, answering with its value, or with git's problem. */
const withHistory = <A, E, R>(
  use: (history: LayoutHistoryService["Type"]) => Effect.Effect<A, GitFailed, R>,
  then: (value: A) => Effect.Effect<E, HandlerFailed, R | ServerIo>,
) =>
  Effect.flatMap(LayoutHistoryService, use).pipe(
    Effect.matchEffect({
      onFailure: gitProblem,
      onSuccess: (value) => Effect.map(then(value), ok),
    }),
  );

export const layoutHistoryServed: ServedApi<LayoutHistoryNeeds> = serve<
  typeof layoutHistoryApi,
  LayoutHistoryNeeds
>(layoutHistoryApi, {
  status: () => withHistory((h) => h.status, Effect.succeed),
  diff: () => withHistory((h) => h.diff, Effect.succeed),
  changes: ({ id }) =>
    isCommitId(id) ? withHistory((h) => h.changes(id), Effect.succeed) : Effect.succeed(
      { ok: false, error: { is: "not-a-version", message: `Not a version: ${id}` } } as const,
    ),
  accept: ({ message }) => withHistory((h) => h.accept(message), Effect.succeed),
  discard: () => withHistory((h) => h.discard, () => liveLayout),
  versions: ({ limit }) => withHistory((h) => h.versions(limit), Effect.succeed),
  restore: ({ id }) =>
    isCommitId(id) ? withHistory((h) => h.restore(id), () => liveLayout) : Effect.succeed(
      { ok: false, error: { is: "not-a-version", message: `Not a version: ${id}` } } as const,
    ),
});
