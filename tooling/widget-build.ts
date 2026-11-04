/**
 * The widget build: bundles every widget folder's main.tsx, and collects their
 * manifests into registry.json. See SELF_BUILDING.md, "The Widget Build".
 */
import { Context, Data, Effect, Either, JSONSchema, Schema } from "effect";
import {
  bundleFile,
  decodeManifestModule,
  type Registry,
  type RegistryEntry,
  registryFile,
  WidgetId,
} from "../src/common/widgets.ts";
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
    const output = yield* bundler.bundle(`${dir}/main.tsx`).pipe(
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
    const bundle = bundleFile(id);
    return {
      entry: {
        id,
        title: manifest.right.title,
        description: manifest.right.description,
        version: script.hash,
        configSchema,
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
