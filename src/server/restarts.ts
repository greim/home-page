/**
 * What a turn's changes to the repo need, for them to take effect: restarting the
 * main server, restarting the assistant service, reloading the page. A file
 * counts for a process when it's in that process's module graph; the page's
 * widgets are served from their build on disk, so they need only a reload.
 */

/** The files under watch, by path relative to the repo, to a hash of their contents. */
export type Fingerprint = ReadonlyMap<string, string>;

/** Each process's modules, by path relative to the repo. */
export type ModuleGraphs = {
  /** The main server (src/server/main.ts). */
  readonly app: ReadonlySet<string>;
  /** The page's own bundle (src/client/main.tsx), which the main server builds at startup. */
  readonly page: ReadonlySet<string>;
  /** The assistant service (src/server/assistant-main.ts). */
  readonly assistant: ReadonlySet<string>;
};

export type Restarts = {
  readonly app: boolean;
  readonly assistant: boolean;
  /** The page should reload to use new code (once the main server is back, if it restarts). */
  readonly reload: boolean;
};

export const noRestarts: Restarts = { app: false, assistant: false, reload: false };

/** Dependencies: a change here can change any process. */
const dependencyFiles = new Set(["deno.json", "deno.lock"]);

/** Where widgets live; their bundles are rebuilt by `deno task build`, not at startup. */
export const widgetsDir = "src/client/widgets/";

/** The files added, removed or changed between two fingerprints. */
export const changedFiles = (before: Fingerprint, after: Fingerprint): ReadonlySet<string> =>
  new Set(
    [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)),
  );

export const restartsFor = (changed: ReadonlySet<string>, graphs: ModuleGraphs): Restarts => {
  const files = [...changed];
  const touches = (graph: ReadonlySet<string>) =>
    files.some((f) => graph.has(f) || dependencyFiles.has(f));
  const page = touches(graphs.page);
  return {
    // The page is bundled by the main server when it starts.
    app: touches(graphs.app) || page,
    assistant: touches(graphs.assistant),
    reload: page || files.some((f) => f.startsWith(widgetsDir)),
  };
};
