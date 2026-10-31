import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import { bundleClient, type BundleOutput, BundlerIo } from "./bundle-client.ts";

const run = (output: BundleOutput) =>
  Effect.runSync(
    Effect.either(
      bundleClient("entry.tsx").pipe(
        Effect.provideService(BundlerIo, { bundle: () => Effect.succeed(output) }),
      ),
    ).pipe(Effect.map(Either.mapLeft((e) => e.message))),
  );

const file = (path: string, hash: string) => ({
  path,
  hash,
  contents: new TextEncoder().encode(path),
});

Deno.test("bundleClient maps output files to assets by base name", () => {
  const result = run({
    success: true,
    errors: [],
    files: [file("/x/out/main.js", "aaaaaaaa"), file("/x/out/main.js.map", "bbbbbbbbbbbb")],
  });
  assertEquals(Either.isRight(result), true);
  const bundle = Either.getOrThrow(result);
  assertEquals([...bundle.assets.keys()], ["main.js", "main.js.map"]);
  assertEquals(bundle.assets.get("main.js")?.contentType, "text/javascript; charset=utf-8");
  assertEquals(bundle.buildId, "aaaaaaaabbbbbbbb");
});

Deno.test("bundleClient fails with the bundler's errors", () => {
  assertEquals(
    run({ success: false, errors: [{ text: "a" }, { text: "b" }], files: [] }),
    Either.left("a\nb"),
  );
});

Deno.test("bundleClient fails when no main.js is produced", () => {
  assertEquals(
    run({ success: true, errors: [], files: [file("/x/other.js", "c")] }),
    Either.left("Bundle produced no main.js"),
  );
});
