/**
 * The widget build: bundles every widget folder's main.tsx, and collects their
 * manifests into registry.json.
 */
import { Context, Data, Effect, Either, JSONSchema, Schema } from "effect";
import {
  type AgentEntry,
  bundleFile,
  decodeManifestModule,
  defaultMaxMinutes,
  type Registry,
  type RegistryEntry,
  registryFile,
  type WidgetAgent,
  WidgetId,
  type WidgetManifest,
} from "../src/common/widgets.ts";
import { defaultInputTraits, riskyCombination } from "../src/common/agent-capabilities.ts";
import {
  bundledSharedPackages,
  dynamicRequireMarker,
  sharedSpecifiers,
} from "../src/common/shared-modules.ts";
import { type BundleError, type BundleOutput, BundlerIo } from "./bundle-client.ts";

export class BuildIoError extends Data.TaggedError("BuildIoError")<{ cause: unknown }> {}

/** Everything that's wrong, so it can all be fixed in one go. */
export class WidgetBuildError extends Data.TaggedError("WidgetBuildError")<{
  problems: ReadonlyArray<string>;
}> {}

export type DirEntry = { readonly name: string; readonly isDirectory: boolean };

export type Bytes = Uint8Array<ArrayBuffer>;

export class WidgetBuildIo extends Context.Tag("WidgetBuildIo")<
  WidgetBuildIo,
  {
    readonly listDir: (path: string) => Effect.Effect<ReadonlyArray<DirEntry>, BuildIoError>;
    readonly importModule: (path: string) => Effect.Effect<unknown, BuildIoError>;
    readonly makeDir: (path: string) => Effect.Effect<void, BuildIoError>;
    readonly writeFile: (path: string, bytes: Bytes) => Effect.Effect<void, BuildIoError>;
    /** Removes a file or directory and everything in it. */
    readonly remove: (path: string) => Effect.Effect<void, BuildIoError>;
    readonly rename: (from: string, to: string) => Effect.Effect<void, BuildIoError>;
  }
>() {}

export type BuildPaths = {
  /** Holds one folder per widget. */
  readonly sourceDir: string;
  /** Replaced by the build's output. */
  readonly outDir: string;
};

type BuiltWidget = {
  readonly entry: RegistryEntry;
  readonly files: ReadonlyArray<readonly [string, Bytes]>;
};

const isNotFound = (e: BuildIoError) => e.cause instanceof Deno.errors.NotFound;

const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const isWidgetId = Schema.is(WidgetId);

/** The folders that hold widgets. A missing source folder means there are none. */
const widgetFolders = (sourceDir: string) =>
  Effect.gen(function* () {
    const io = yield* WidgetBuildIo;
    const entries = yield* io.listDir(sourceDir).pipe(
      Effect.catchIf(isNotFound, () => Effect.succeed([])),
    );
    return entries
      .filter((e) => e.isDirectory && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  });

const bundled = (output: BundleOutput, name: string) =>
  output.files.find((f) => baseName(f.path) === name);

/** The `sources` a bundle's source map lists, or none if it has no readable map. */
const mapSources = (map: Bytes | undefined): ReadonlyArray<string> => {
  if (map === undefined) return [];
  const parsed = Either.try(() => JSON.parse(new TextDecoder().decode(map)) as unknown);
  if (Either.isLeft(parsed)) return [];
  const value = parsed.right;
  const sources = typeof value === "object" && value !== null && "sources" in value
    ? value.sources
    : [];
  return Array.isArray(sources) ? sources.filter((s): s is string => typeof s === "string") : [];
};

/**
 * Why a widget's bundle can't use the page's shared packages, if it can't: it
 * carries its own copy of one (a part not shared, like `effect/Schema`), or has
 * CommonJS code that `require()`s one, which throws in the browser.
 */
const sharingProblem = (script: Bytes, map: Bytes | undefined): string | null => {
  const copies = bundledSharedPackages(mapSources(map));
  if (copies.length > 0) {
    return `it bundles its own copy of ${copies.join(", ")}, which the page shares. ` +
      `Import only these names from them: ${sharedSpecifiers.join(", ")}`;
  }
  if (new TextDecoder().decode(script).includes(dynamicRequireMarker)) {
    return `it bundles CommonJS code that require()s a package the page shares ` +
      `(${sharedSpecifiers.join(", ")}). Use a version of that dependency with ES modules`;
  }
  return null;
};

const buildOne = (
  sourceDir: string,
  id: string,
): Effect.Effect<BuiltWidget, string, WidgetBuildIo | BundlerIo> =>
  Effect.gen(function* () {
    const io = yield* WidgetBuildIo;
    const bundler = yield* BundlerIo;
    if (!isWidgetId(id)) {
      return yield* Effect.fail(
        `its folder name must be lowercase letters, digits and single hyphens`,
      );
    }
    const dir = `${sourceDir}/${id}`;
    const names = new Set(
      (yield* io.listDir(dir).pipe(Effect.mapError((e) => describe(e.cause)))).map((e) => e.name),
    );
    const missing = ["main.tsx", "manifest.ts"].filter((n) => !names.has(n));
    if (missing.length > 0) {
      return yield* Effect.fail(`it has no ${missing.join(" or ")}`);
    }
    const module = yield* io.importModule(`${dir}/manifest.ts`).pipe(
      Effect.mapError((e) => `its manifest.ts failed to load: ${describe(e.cause)}`),
    );
    const manifest = decodeManifestModule(module);
    if (Either.isLeft(manifest)) {
      return yield* Effect.fail(`its manifest is invalid: ${manifest.left}`);
    }
    const configSchema = yield* Effect.try({
      try: () => JSONSchema.make(manifest.right.config),
      catch: (cause) => `its config schema can't be described as JSON Schema: ${describe(cause)}`,
    });
    const defaultConfig = yield* Either.mapLeft(
      Schema.encodeEither(manifest.right.config)(manifest.right.defaultConfig),
      (e) => `its defaultConfig doesn't fit its config schema: ${e.message}`,
    );
    const agents = yield* agentEntries(manifest.right, names.has(agentToolsFile));
    // The page supplies the shared packages (see src/common/shared-modules.ts).
    const output = yield* bundler.bundle({
      entrypoints: [`${dir}/main.tsx`],
      external: sharedSpecifiers,
      codeSplitting: false,
    }).pipe(
      Effect.mapError((e: BundleError) => `it failed to bundle: ${e.message}`),
    );
    if (!output.success) {
      return yield* Effect.fail(
        `it failed to bundle:\n${output.errors.map((e) => e.text).join("\n")}`,
      );
    }
    const script = bundled(output, "main.js");
    if (script === undefined) {
      return yield* Effect.fail(`bundling it produced no main.js`);
    }
    const map = bundled(output, "main.js.map");
    const problem = sharingProblem(script.contents, map?.contents);
    if (problem !== null) {
      return yield* Effect.fail(problem);
    }
    const bundle = bundleFile(id);
    return {
      entry: {
        id,
        title: manifest.right.title,
        description: manifest.right.description,
        version: script.hash,
        configSchema,
        defaultConfig,
        permissions: manifest.right.permissions ?? null,
        agents,
      },
      files: [
        [bundle, script.contents] as const,
        ...(map === undefined ? [] : [[`${bundle}.map`, map.contents] as const]),
      ],
    };
  }).pipe(Effect.mapError((problem) => `Widget "${id}": ${problem}`));

const dirName = (path: string) => path.slice(0, path.lastIndexOf("/"));

const removeIfThere = (path: string) =>
  Effect.flatMap(
    WidgetBuildIo,
    (io) => io.remove(path).pipe(Effect.catchIf(isNotFound, () => Effect.void)),
  );

/** Writes the output beside the old, then swaps it in, so readers never see half a build. */
const writeOutput = (
  outDir: string,
  files: ReadonlyArray<readonly [string, Bytes]>,
) =>
  Effect.gen(function* () {
    const io = yield* WidgetBuildIo;
    const staging = `${outDir}.next`;
    yield* removeIfThere(staging);
    yield* io.makeDir(staging);
    for (const [path, bytes] of files) {
      yield* io.makeDir(dirName(`${staging}/${path}`));
      yield* io.writeFile(`${staging}/${path}`, bytes);
    }
    yield* removeIfThere(outDir);
    yield* io.rename(staging, outDir);
  });

/** Where a widget's own agent tools are, in its folder. */
export const agentToolsFile = "agent-tools.ts";

/** Why an agent's capabilities can't be built, or null if they can. */
const capabilityProblem = (
  name: string,
  agent: WidgetAgent,
  services: ReadonlyArray<string>,
  hasAgentTools: boolean,
): string | null => {
  const capabilities = agent.capabilities ?? [];
  const risky = riskyCombination(agent.input ?? defaultInputTraits, capabilities);
  if (risky !== null) return `its agent "${name}" is too risky: ${risky}`;
  for (const capability of capabilities) {
    if (capability.use === "mcp" && !services.includes(capability.service)) {
      return `its agent "${name}" uses the "${capability.server}" MCP server, so its ` +
        `manifest's permissions must list "${capability.service}" as a service it sends data to`;
    }
    if (capability.use === "widget-tools" && !hasAgentTools) {
      return `its agent "${name}" uses widget tools, but the widget has no ${agentToolsFile}`;
    }
  }
  return null;
};

/**
 * A manifest's agents as the registry has them. What a widget sends its agents goes to
 * Anthropic, so a widget with agents must say so under `permissions`; and each agent's
 * capabilities must pass the checks in `capabilityProblem`.
 */
export const agentEntries = (
  manifest: WidgetManifest<unknown, unknown>,
  hasAgentTools: boolean,
): Effect.Effect<Readonly<Record<string, AgentEntry>>, string> =>
  Effect.gen(function* () {
    const agents = Object.entries(manifest.agents ?? {});
    if (agents.length === 0) return {};
    const toAnthropic = manifest.permissions?.services.some((s) => /anthropic/i.test(s.name));
    if (toAnthropic !== true) {
      return yield* Effect.fail(
        "it has agents, so its manifest's permissions must name Anthropic as a service it " +
          "sends data to (what it sends its agents goes there)",
      );
    }
    const services = (manifest.permissions?.services ?? []).map((s) => s.name);
    for (const [name, agent] of agents) {
      const problem = capabilityProblem(name, agent, services, hasAgentTools);
      if (problem !== null) return yield* Effect.fail(problem);
    }
    const entries = yield* Effect.forEach(agents, ([name, agent]) =>
      Effect.try({
        try: (): readonly [string, AgentEntry] => [name, {
          title: agent.title,
          instructions: agent.instructions,
          outputSchema: JSONSchema.make(agent.output),
          model: agent.model ?? null,
          maxTurns: agent.maxTurns,
          maxBudgetUsd: agent.maxBudgetUsd,
          maxMinutes: agent.maxMinutes ?? defaultMaxMinutes,
          capabilities: agent.capabilities ?? [],
          input: agent.input ?? defaultInputTraits,
        }],
        catch: (cause) =>
          `its agent "${name}"'s output schema can't be described as JSON Schema: ${
            describe(cause)
          }`,
      }));
    return Object.fromEntries(entries);
  });

export const buildWidgets = (
  paths: BuildPaths,
): Effect.Effect<Registry, WidgetBuildError | BuildIoError, WidgetBuildIo | BundlerIo> =>
  Effect.gen(function* () {
    const ids = yield* widgetFolders(paths.sourceDir);
    const results = yield* Effect.forEach(
      ids,
      (id) => Effect.either(buildOne(paths.sourceDir, id)),
    );
    const problems = results.filter(Either.isLeft).map((r) => r.left);
    if (problems.length > 0) {
      return yield* new WidgetBuildError({ problems });
    }
    const built = results.filter(Either.isRight).map((r) => r.right);
    const registry: Registry = { widgets: built.map((b) => b.entry) };
    const registryBytes = new TextEncoder().encode(JSON.stringify(registry, null, 2) + "\n");
    yield* writeOutput(paths.outDir, [
      ...built.flatMap((b) => b.files),
      [registryFile, registryBytes],
    ]);
    return registry;
  });

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new BuildIoError({ cause }) });

export const WidgetBuildIoLive = WidgetBuildIo.of({
  listDir: (path) =>
    attempt(() =>
      Array.fromAsync(Deno.readDir(path), (e) => ({ name: e.name, isDirectory: e.isDirectory }))
    ),
  importModule: (path) => attempt(() => import(new URL(`file://${path}`).href)),
  makeDir: (path) => attempt(() => Deno.mkdir(path, { recursive: true })),
  writeFile: (path, bytes) => attempt(() => Deno.writeFile(path, bytes)),
  remove: (path) => attempt(() => Deno.remove(path, { recursive: true })),
  rename: (from, to) => attempt(() => Deno.rename(from, to)),
});
