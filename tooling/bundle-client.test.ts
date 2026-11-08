import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import {
  bundleClient,
  type BundleOutput,
  type BundleRequest,
  BundlerIo,
  BundlerIoLive,
} from "./bundle-client.ts";
import { config } from "../src/server/config.ts";
import { sharedModules } from "../src/common/shared-modules.ts";

const file = (path: string, hash: string) => ({
  path,
  hash,
  contents: new TextEncoder().encode(path),
});

const requests: Array<BundleRequest> = [];

/** The shared modules' scripts, as the bundler names them. */
const sharedFiles = sharedModules.map((m) => file(`shared/${m.entry}.js`, ""));

const run = (output: BundleOutput) =>
  Effect.runSync(
    Effect.either(
      bundleClient("main.tsx", ["shared/react.ts"]).pipe(
        Effect.provideService(BundlerIo, {
          bundle: (request) => {
            requests.push(request);
            return Effect.succeed(output);
          },
        }),
      ),
    ).pipe(Effect.map(Either.mapLeft((e) => e.message))),
  );

Deno.test("bundleClient bundles the page with the shared modules, splitting shared code", () => {
  requests.length = 0;
  run({ success: true, errors: [], files: [file("main.js", "a"), ...sharedFiles] });
  assertEquals(requests, [{
    entrypoints: ["main.tsx", "shared/react.ts"],
    external: [],
    codeSplitting: true,
  }]);
});

Deno.test("bundleClient maps output files to assets by their paths", () => {
  const result = run({
    success: true,
    errors: [],
    files: [
      file("main.js", "aaaaaaaa"),
      file("main.js.map", "bbbbbbbbbbbb"),
      file("chunk-X.js", "c"),
      ...sharedFiles,
    ],
  });
  assertEquals(Either.isRight(result), true);
  const bundle = Either.getOrThrow(result);
  assertEquals([...bundle.assets.keys()].slice(0, 4), [
    "main.js",
    "main.js.map",
    "chunk-X.js",
    "shared/react.js",
  ]);
  assertEquals(bundle.assets.get("main.js")?.contentType, "text/javascript; charset=utf-8");
  assertEquals(bundle.buildId, "aaaaaaaabbbbbbbb");
});

Deno.test("bundleClient fails with the bundler's errors", () => {
  assertEquals(
    run({ success: false, errors: [{ text: "a" }, { text: "b" }], files: [] }),
    Either.left("a\nb"),
  );
});

Deno.test("bundleClient fails when the page's script or a shared module isn't produced", () => {
  assertEquals(
    run({ success: true, errors: [], files: [file("other.js", "c"), ...sharedFiles] }),
    Either.left("Bundle produced no main.js"),
  );
  assertEquals(
    run({ success: true, errors: [], files: [file("main.js", "c"), ...sharedFiles.slice(1)] }),
    Either.left("Bundle produced no shared/react.js"),
  );
});

Deno.test({
  name: "the real page bundle's shared modules export everything their packages do",
  // Importing the bundled React DOM starts its scheduler, which leaves a timer.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const bundle = await Effect.runPromise(
      bundleClient(config.clientEntry, config.sharedEntries).pipe(
        Effect.provideService(BundlerIo, BundlerIoLive),
      ),
    );
    const outDir = await Deno.makeTempDir();
    for (const [path, asset] of bundle.assets) {
      await Deno.mkdir(`${outDir}/${path}`.replace(/\/[^/]*$/, ""), { recursive: true });
      await Deno.writeFile(`${outDir}/${path}`, asset.body);
    }
    for (const m of sharedModules) {
      const shared = await import(`file://${outDir}/shared/${m.entry}.js`);
      const original = await import(m.specifier);
      // Deno also lists a CommonJS module's `module.exports`, which bundles don't have.
      const expected = Object.keys(original).filter((k) => k !== "module.exports").sort();
      assertEquals(Object.keys(shared).sort(), expected, m.specifier);
    }
    await Deno.remove(outDir, { recursive: true });
  },
});
