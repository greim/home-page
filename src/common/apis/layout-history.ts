/**
 * The layout history API: the page's own (no widget declares it) for the layout's versions,
 * kept by the main server in a git repo of their own (see src/server/layout-history.ts). The
 * live layout is the working copy; a change to it is "pending" until the user accepts it as a
 * new version or discards it. Operations that put a different layout in place (discard, restore)
 * answer with it, for the page to show.
 */
import { Schema } from "effect";
import { Layout } from "../model.ts";
import { apiError, defineApi, operation } from "../widget-apis.ts";

/**
 * How the live layout compares with the last accepted one: the same, changed, or never
 * accepted (nothing was kept before it).
 */
export const Pending = Schema.Literal("clean", "modified", "new");
export type Pending = typeof Pending.Type;

export const Version = Schema.Struct({
  /** A commit id. */
  id: Schema.String,
  /** When it was accepted, as ISO 8601. */
  date: Schema.String,
  /** What was accepted: one line. */
  message: Schema.String,
});
export type Version = typeof Version.Type;

/** What was asked for isn't a version of the layout. */
export const NotAVersion = apiError("not-a-version");

/**
 * Git failed (or can't be run), so the history couldn't be read or changed. The message is
 * git's own, e.g. that another git command holds a lock: try again in a moment.
 */
export const GitProblem = apiError("git-problem");

const noErrors = GitProblem;

export const layoutHistoryApi = defineApi("layout-history", "main", {
  /** Whether the live layout has changes to accept or discard. */
  status: operation({ input: Schema.Struct({}), output: Pending, errors: noErrors }),
  /**
   * What changed since the last accepted version, as a unified diff of the layout file (cut if
   * very long). Empty if nothing changed, or the layout was never accepted.
   */
  diff: operation({ input: Schema.Struct({}), output: Schema.String, errors: noErrors }),
  /** What an accepted version changed, as a unified diff of the layout file (cut if very long). */
  changes: operation({
    input: Schema.Struct({ id: Schema.String }),
    output: Schema.String,
    errors: Schema.Union(NotAVersion, GitProblem),
  }),
  /** Accepts the live layout as a new version, with a one-line message. Whether it did. */
  accept: operation({
    input: Schema.Struct({ message: Schema.String }),
    output: Schema.Boolean,
    errors: noErrors,
  }),
  /** Puts the last accepted layout back, answering with it. */
  discard: operation({ input: Schema.Struct({}), output: Layout, errors: noErrors }),
  /** The accepted versions, newest first. */
  versions: operation({
    input: Schema.Struct({ limit: Schema.Int.pipe(Schema.between(1, 500)) }),
    output: Schema.Array(Version),
    errors: noErrors,
  }),
  /**
   * Puts a version's layout in place of the live one, as a pending change (nothing is accepted
   * until the user does), answering with it.
   */
  restore: operation({
    input: Schema.Struct({ id: Schema.String }),
    output: Layout,
    errors: Schema.Union(NotAVersion, GitProblem),
    maxBytes: 4_000_000,
  }),
}, { services: [] });

export type LayoutHistoryApi = typeof layoutHistoryApi;
