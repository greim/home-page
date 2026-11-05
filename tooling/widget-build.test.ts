import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Either, Schema } from "effect";
import { defineManifest } from "../src/common/widgets.ts";
import { BundleError, type BundleOutput, BundlerIo, BundlerIoLive } from "./bundle-client.ts";
import {
  BuildIoError,
  buildWidgets,
  type Bytes,
  type DirEntry,
  WidgetBuildIo,
  WidgetBuildIoLive,
} from "./widget-build.ts";

const manifest = defineManifest({
  title: "Clock",
  description: "Shows the time",
  config: Schema.Struct({ zone: Schema.String }),
  defaultConfig: { zone: "UTC" },
});

const notFound = () => new BuildIoError({ cause: new Deno.errors.NotFound("missing") });

const encode = (s: string): Bytes => new TextEncoder().encode(s);

type World = {
  /** Directory listings, by path. */
  readonly dirs: Map<string, ReadonlyArray<DirEntry>>;
  /** Manifest modules, by path. */
  readonly modules: Map<string, unknown>;
  /** Bundler output, by entry path. */
  readonly bundles: Map<string, BundleOutput | BundleError>;
};

const dir = (name: string): DirEntry => ({ name, isDirectory: true });
const file = (name: string): DirEntry => ({ name, isDirectory: false });

const widgetFiles = [file("main.tsx"), file("manifest.ts")];

const okBundle = (hash: string): BundleOutput => ({
  success: true,
  errors: [],
  files: [
    { path: "/out/main.js", hash, contents: encode(`js ${hash}`) },
    { path: "/out/main.js.map", hash: "m", contents: encode("map") },
  ],
});

/** A world with the given widgets, each well-formed. */
const worldWith = (ids: ReadonlyArray<string>, top: ReadonlyArray<DirEntry> = []): World => ({
  dirs: new Map([
    ["/src", [...ids.map(dir), ...top]],
    ...ids.map((id) => [`/src/${id}`, widgetFiles] as const),
  ]),
  modules: new Map(ids.map((id) => [`/src/${id}/manifest.ts`, { manifest }])),
  bundles: new Map(ids.map((id) => [`/src/${id}/main.tsx`, okBundle(`h-${id}`)])),
});

const run = (world: World) => {
  const disk = new Map<string, string>();
  const log: Array<string> = [];
  const io = WidgetBuildIo.of({
    listDir: (path) => {
      const entries = world.dirs.get(path);
      return entries === undefined ? Effect.fail(notFound()) : Effect.succeed(entries);
    },
    importModule: (path) =>
      world.modules.has(path)
        ? Effect.succeed(world.modules.get(path))
        : Effect.fail(new BuildIoError({ cause: new Error("syntax error") })),
    makeDir: () => Effect.void,
    writeFile: (path, bytes) =>
      Effect.sync(() => {
        disk.set(path, new TextDecoder().decode(bytes));
      }),
    remove: (path) =>
      Effect.sync(() => log.push(`remove ${path}`)).pipe(
        Effect.andThen(Effect.fail(notFound())),
      ),
    rename: (from, to) => Effect.sync(() => log.push(`rename ${from} ${to}`)),
  });
  const bundler = BundlerIo.of({
    bundle: (entry) => {
      const output = world.bundles.get(entry);
      return output instanceof BundleError || output === undefined
        ? Effect.fail(output ?? new BundleError({ message: "no such entry" }))
        : Effect.succeed(output);
    },
  });
  const result = Effect.runSync(
    Effect.either(buildWidgets({ sourceDir: "/src", outDir: "/dist/widgets" })).pipe(
      Effect.provideService(WidgetBuildIo, io),
      Effect.provideService(BundlerIo, bundler),
    ),
  );
  return { result, disk, log };
};

const problems = (world: World) => {
  const { result } = run(world);
  return Either.isLeft(result) && result.left._tag === "WidgetBuildError"
    ? result.left.problems
    : [];
};

Deno.test("buildWidgets writes each bundle and a registry, then swaps them in", () => {
  const { result, disk, log } = run(worldWith(["clock", "news-feed"]));
  assertEquals(Either.isRight(result), true);
  assertEquals([...disk.keys()].sort(), [
    "/dist/widgets.next/clock/main.js",
    "/dist/widgets.next/clock/main.js.map",
    "/dist/widgets.next/news-feed/main.js",
    "/dist/widgets.next/news-feed/main.js.map",
    "/dist/widgets.next/registry.json",
  ]);
  assertEquals(disk.get("/dist/widgets.next/clock/main.js"), "js h-clock");
  const registry = JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "");
  assertEquals(registry.widgets.map((w: { id: string }) => w.id), ["clock", "news-feed"]);
  assertEquals(registry.widgets[0].title, "Clock");
  assertEquals(registry.widgets[0].version, "h-clock");
  assertEquals(registry.widgets[0].configSchema.properties.zone, { type: "string" });
  assertEquals(registry.widgets[0].defaultConfig, { zone: "UTC" });
  assertEquals(log, [
    "remove /dist/widgets.next",
    "remove /dist/widgets",
    "rename /dist/widgets.next /dist/widgets",
  ]);
});

Deno.test("buildWidgets skips loose files and hidden folders", () => {
  const world = worldWith(["clock"], [file(".DS_Store"), file("README.md"), dir(".cache")]);
  const { result } = run(world);
  assertEquals(Either.map(result, (r) => r.widgets.map((w) => w.id)), Either.right(["clock"]));
});

Deno.test("buildWidgets with no widgets folder writes an empty registry", () => {
  const { result, disk } = run({ dirs: new Map(), modules: new Map(), bundles: new Map() });
  assertEquals(Either.map(result, (r) => r.widgets), Either.right([]));
  assertEquals(disk.get("/dist/widgets.next/registry.json"), `{\n  "widgets": []\n}\n`);
});

Deno.test("buildWidgets reports every broken widget, and writes nothing", () => {
  const world = worldWith(["fine", "no-main", "bad-manifest", "no-bundle", "Bad_Name"]);
  world.dirs.set("/src/no-main", [file("manifest.ts")]);
  world.modules.set("/src/bad-manifest/manifest.ts", { manifest: { title: "" } });
  world.bundles.set("/src/no-bundle/main.tsx", {
    success: false,
    errors: [{ text: "Unexpected token" }],
    files: [],
  });
  const { result, disk } = run(world);
  const found = Either.isLeft(result) && result.left._tag === "WidgetBuildError"
    ? result.left.problems
    : [];
  assertEquals(found.length, 4);
  assertStringIncludes(found.join("\n"), `Widget "Bad_Name": its folder name must be`);
  assertStringIncludes(found.join("\n"), `Widget "bad-manifest": its manifest is invalid`);
  assertStringIncludes(
    found.join("\n"),
    `Widget "no-bundle": it failed to bundle:\nUnexpected token`,
  );
  assertStringIncludes(found.join("\n"), `Widget "no-main": it has no main.tsx`);
  assertEquals(disk.size, 0);
});

Deno.test("buildWidgets reports a manifest that won't load", () => {
  const world = worldWith(["clock"]);
  world.modules.delete("/src/clock/manifest.ts");
  assertStringIncludes(problems(world).join(), "its manifest.ts failed to load: syntax error");
});

Deno.test("buildWidgets reports a config schema JSON Schema can't describe", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: { ...manifest, config: Schema.declare((u): u is Date => u instanceof Date) },
  });
  assertStringIncludes(problems(world).join(), "can't be described as JSON Schema");
});

Deno.test("buildWidgets reports a default config that doesn't fit the schema", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: { ...manifest, defaultConfig: { zone: 5 } },
  });
  assertStringIncludes(problems(world).join(), "its defaultConfig doesn't fit");
});

Deno.test("buildWidgets reports a bundler that fails outright", () => {
  const world = worldWith(["clock"]);
  world.bundles.set("/src/clock/main.tsx", new BundleError({ message: "crashed" }));
  assertStringIncludes(problems(world).join(), "it failed to bundle: crashed");
});

Deno.test("buildWidgets reports a bundle with no main.js", () => {
  const world = worldWith(["clock"]);
  world.bundles.set("/src/clock/main.tsx", { success: true, errors: [], files: [] });
  assertStringIncludes(problems(world).join(), "bundling it produced no main.js");
});

Deno.test("buildWidgets reports a widget folder it can't read", () => {
  const world = worldWith(["clock"]);
  world.dirs.delete("/src/clock");
  assertStringIncludes(problems(world).join(), `Widget "clock": missing`);
});

Deno.test("buildWidgets builds a real widget with the real bundler", async () => {
  const outDir = `${await Deno.makeTempDir()}/widgets`;
  const sourceDir = new URL("./fixtures/widgets", import.meta.url).pathname;
  const registry = await Effect.runPromise(
    buildWidgets({ sourceDir, outDir }).pipe(
      Effect.provideService(WidgetBuildIo, WidgetBuildIoLive),
      Effect.provideService(BundlerIo, BundlerIoLive),
    ),
  );
  assertEquals(registry.widgets.map((w) => [w.id, w.title]), [["echo", "Echo"]]);
  assertEquals(
    JSON.parse(await Deno.readTextFile(`${outDir}/registry.json`)),
    JSON.parse(JSON.stringify(registry)),
  );
  assertStringIncludes(await Deno.readTextFile(`${outDir}/echo/main.js`), "ask-shell");
  assertEquals((await Deno.stat(`${outDir}/echo/main.js.map`)).isFile, true);
  // A rebuild replaces the output, and leaves no staging folder behind.
  await Effect.runPromise(
    buildWidgets({ sourceDir, outDir }).pipe(
      Effect.provideService(WidgetBuildIo, WidgetBuildIoLive),
      Effect.provideService(BundlerIo, BundlerIoLive),
    ),
  );
  assertEquals(
    (await Array.fromAsync(Deno.readDir(`${outDir}/..`), (e) => e.name)).sort(),
    ["widgets"],
  );
  await Deno.remove(`${outDir}/..`, { recursive: true });
});
