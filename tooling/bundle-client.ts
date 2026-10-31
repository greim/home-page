/**
 * Bundles the browser app in memory using Deno's built-in bundler. Nothing is
 * written to disk; the server holds the output and serves it directly.
 */
import { Context, Data, Effect } from "effect";
import { type Asset, contentTypeFor } from "../src/server/http.ts";
import { clientScript } from "../src/server/routes.ts";

export class BundleError extends Data.TaggedError("BundleError")<{
  message: string;
}> {}

export type BundleOutput = {
  readonly success: boolean;
  readonly errors: ReadonlyArray<{ readonly text: string }>;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly contents: Uint8Array<ArrayBuffer>;
    readonly hash: string;
  }>;
};

export class BundlerIo extends Context.Tag("BundlerIo")<
  BundlerIo,
  { readonly bundle: (entry: string) => Effect.Effect<BundleOutput, BundleError> }
>() {}

export type Bundle = {
  readonly assets: ReadonlyMap<string, Asset>;
  readonly buildId: string;
};

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export const bundleClient = (
  entry: string,
): Effect.Effect<Bundle, BundleError, BundlerIo> =>
  Effect.gen(function* () {
    const io = yield* BundlerIo;
    const output = yield* io.bundle(entry);
    if (!output.success) {
      return yield* new BundleError({
        message: output.errors.map((e) => e.text).join("\n"),
      });
    }
    const assets = new Map(
      output.files.map((f) => {
        const name = baseName(f.path);
        return [name, { contentType: contentTypeFor(name), body: f.contents }];
      }),
    );
    if (!assets.has(clientScript)) {
      return yield* new BundleError({ message: `Bundle produced no ${clientScript}` });
    }
    return {
      assets,
      buildId: output.files.map((f) => f.hash).join("").slice(0, 16),
    };
  });

/** The real bundler. `outputDir` only names the files; nothing is written. */
export const BundlerIoLive = BundlerIo.of({
  bundle: (entry) =>
    Effect.tryPromise({
      try: () =>
        Deno.bundle({
          entrypoints: [entry],
          outputDir: "out",
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
          path: f.path,
          contents: f.contents ?? new Uint8Array(),
          hash: f.hash,
        })),
      })),
    ),
});
