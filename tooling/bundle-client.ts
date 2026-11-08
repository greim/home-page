/**
 * Bundles the browser app in memory using Deno's built-in bundler. Nothing is
 * written to disk; the server holds the output and serves it directly. The
 * widget build uses the same bundler, through {@link BundlerIo}.
 */
import { Context, Data, Effect } from "effect";
import { type Asset, contentTypeFor } from "../src/server/http.ts";
import { clientScript } from "../src/server/routes.ts";
import { sharedDir, sharedModules } from "../src/common/shared-modules.ts";

export class BundleError extends Data.TaggedError("BundleError")<{
  message: string;
}> {}

/** What to bundle, and how. */
export type BundleRequest = {
  readonly entrypoints: ReadonlyArray<string>;
  /** Module names left out of the bundle, imported by name for the page to supply. */
  readonly external: ReadonlyArray<string>;
  /** Puts code the entry points share in chunks of their own, so it's loaded once. */
  readonly codeSplitting: boolean;
};

export type BundleOutput = {
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly text: string }>;
  /**
   * Each file's path is relative to the output's root, which is the folder that
   * holds all the entry points: e.g. `main.js`, `shared/react.js`, `chunk-AB12.js`.
   */
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly contents: Uint8Array<ArrayBuffer>;
    readonly hash: string;
  }>;
};

export class BundlerIo extends Context.Tag("BundlerIo")<
  BundlerIo,
  { readonly bundle: (request: BundleRequest) => Effect.Effect<BundleOutput, BundleError> }
>() {}

export type Bundle = {
  /** By path relative to the page's assets, e.g. `main.js` or `shared/react.js`. */
  readonly assets: ReadonlyMap<string, Asset>;
  readonly buildId: string;
};

/**
 * Bundles the page from its entry point, together with the shared modules
 * (`sharedEntries`, under `shared/` beside it; see src/common/shared-modules.ts).
 * Code they share goes in chunks, so the page and the shared modules (which
 * widgets import) use the same single copy of each package.
 */
export const bundleClient = (
  entry: string,
  sharedEntries: ReadonlyArray<string>,
): Effect.Effect<Bundle, BundleError, BundlerIo> =>
  Effect.gen(function* () {
    const io = yield* BundlerIo;
    const output = yield* io.bundle({
      entrypoints: [entry, ...sharedEntries],
      external: [],
      codeSplitting: true,
    });
    if (!output.success) {
      return yield* new BundleError({
        message: output.errors.map((e) => e.text).join("\n"),
      });
    }
    const assets = new Map(
      output.files.map((f) => [f.path, { contentType: contentTypeFor(f.path), body: f.contents }]),
    );
    const expected = [
      clientScript,
      ...sharedModules.map((m) => `${sharedDir}/${m.entry}.js`),
    ];
    const missing = expected.filter((name) => !assets.has(name));
    if (missing.length > 0) {
      return yield* new BundleError({ message: `Bundle produced no ${missing.join(", ")}` });
    }
    return {
      assets,
      buildId: output.files.map((f) => f.hash).join("").slice(0, 16),
    };
  });

/** Where the real bundler says its output goes. Nothing is written there. */
const outputRoot = "/bundle-output";

/** The real bundler. */
export const BundlerIoLive = BundlerIo.of({
  bundle: (request) =>
    Effect.tryPromise({
      try: () =>
        Deno.bundle({
          entrypoints: [...request.entrypoints],
          external: [...request.external],
          codeSplitting: request.codeSplitting,
          outputDir: outputRoot,
          platform: "browser",
          format: "esm",
          minify: true,
          sourcemap: "linked",
          write: false,
        }),
      catch: (cause) => new BundleError({ message: String(cause) }),
    }).pipe(
      Effect.map((result): BundleOutput => ({
        success: result.success,
        errors: result.errors,
        files: (result.outputFiles ?? []).map((f) => ({
          path: f.path.startsWith(`${outputRoot}/`) ? f.path.slice(outputRoot.length + 1) : f.path,
          contents: f.contents ?? new Uint8Array(),
          hash: f.hash,
        })),
      })),
    ),
});
