import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Either, Schema } from "effect";
import { defineManifest, type Permissions, type WidgetManifest } from "../src/common/widgets.ts";
import { agentRunsApi } from "../src/common/apis/agent-runs.ts";
import { defineApi } from "../src/common/widget-apis.ts";
import {
  BundleError,
  type BundleOutput,
  type BundleRequest,
  BundlerIo,
  BundlerIoLive,
} from "./bundle-client.ts";
import { sharedSpecifiers } from "../src/common/shared-modules.ts";
import {
  apiNames,
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
    { path: "main.js", hash, contents: encode(`js ${hash}`) },
    { path: "main.js.map", hash: "m", contents: encode(`{"sources":["../src/main.tsx"]}`) },
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
  const requests: Array<BundleRequest> = [];
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
    bundle: (request) => {
      requests.push(request);
      const output = world.bundles.get(request.entrypoints.join());
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
  return { result, disk, log, requests };
};

const problems = (world: World) => {
  const { result } = run(world);
  return Either.isLeft(result) && result.left._tag === "WidgetBuildError"
    ? result.left.problems
    : [];
};

Deno.test("the registry carries the outside services a widget's manifest declares", () => {
  const permissions = {
    services: [{
      name: "Geocoder",
      sends: "Street addresses",
      privacyPolicy: "https://example.com/privacy",
      terms: "https://example.com/terms",
    }],
  };
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", { manifest: { ...manifest, permissions } });
  const { disk } = run(world);
  const registry = JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "");
  assertEquals(registry.widgets[0].permissions, permissions);
});

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
  // It sends nothing anywhere, so there's nothing for the user to agree to.
  assertEquals(registry.widgets[0].permissions, null);
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

Deno.test("buildWidgets leaves the shared packages out of each bundle", () => {
  const { requests } = run(worldWith(["clock"]));
  assertEquals(requests, [{
    entrypoints: ["/src/clock/main.tsx"],
    external: sharedSpecifiers,
    codeSplitting: false,
  }]);
});

/** A bundle of `script`, whose source map lists `sources`. */
const bundleOf = (script: string, sources: ReadonlyArray<string>): BundleOutput => ({
  success: true,
  errors: [],
  files: [
    { path: "main.js", hash: "h", contents: encode(script) },
    { path: "main.js.map", hash: "m", contents: encode(JSON.stringify({ sources })) },
  ],
});

Deno.test("buildWidgets rejects a widget carrying its own copy of a shared package", () => {
  const world = worldWith(["clock"]);
  world.bundles.set(
    "/src/clock/main.tsx",
    bundleOf("js", [
      "../src/main.tsx",
      "../node_modules/.deno/effect@3.22.4/node_modules/effect/dist/esm/Schema.js",
    ]),
  );
  assertStringIncludes(problems(world).join(), "it bundles its own copy of effect");
});

Deno.test("buildWidgets rejects CommonJS code that requires a shared package", () => {
  const world = worldWith(["clock"]);
  world.bundles.set(
    "/src/clock/main.tsx",
    bundleOf(`throw Error('Dynamic require of "'+x+'" is not supported')`, []),
  );
  assertStringIncludes(problems(world).join(), "require()s a package the page shares");
});

Deno.test("buildWidgets checks sharing even without a readable source map", () => {
  const world = worldWith(["clock", "notes"]);
  world.bundles.set("/src/clock/main.tsx", {
    success: true,
    errors: [],
    files: [{ path: "main.js", hash: "h", contents: encode("js") }],
  });
  world.bundles.set("/src/notes/main.tsx", {
    success: true,
    errors: [],
    files: [
      { path: "main.js", hash: "h", contents: encode("js") },
      { path: "main.js.map", hash: "m", contents: encode("not json") },
    ],
  });
  assertEquals(problems(world), []);
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

const agent = {
  title: "Check",
  instructions: "Check it.",
  output: Schema.Struct({ summary: Schema.String }),
  maxTurns: 3,
  maxBudgetUsd: 0.2,
};
const toAnthropic = {
  services: [{
    name: "Anthropic (Claude)",
    sends: "Your text",
    privacyPolicy: "https://example.com/privacy",
    terms: "https://example.com/terms",
  }],
};

Deno.test("the registry carries a widget's agents, their output schemas as JSON Schema", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: { ...manifest, permissions: toAnthropic, agents: { check: agent } },
  });
  const { disk } = run(world);
  const registry = JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "");
  const check = registry.widgets[0].agents.check;
  assertEquals([check.title, check.instructions, check.model, check.maxTurns, check.maxBudgetUsd], [
    "Check",
    "Check it.",
    null,
    3,
    0.2,
  ]);
  assertEquals(check.outputSchema.properties.summary, { type: "string" });
  assertEquals(
    JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "").widgets[0].id,
    "clock",
  );
});

Deno.test("a widget with agents must declare that its data goes to Anthropic", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: { ...manifest, agents: { check: agent } },
  });
  assertStringIncludes(problems(world).join(), "must name Anthropic");
  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      agents: { check: agent },
      permissions: { services: [{ ...toAnthropic.services[0], name: "Geocoder" }] },
    },
  });
  assertStringIncludes(problems(world).join(), "must name Anthropic");
});

Deno.test("an agent's limits must be sensible", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      permissions: toAnthropic,
      agents: { check: { ...agent, maxTurns: 0 } },
    },
  });
  assertStringIncludes(problems(world).join(), "maxTurns");
});

Deno.test("an agent may offer only models the app knows, including its default", () => {
  const world = worldWith(["clock"]);
  const withAgent = (a: unknown) =>
    world.modules.set("/src/clock/manifest.ts", {
      manifest: { ...manifest, permissions: toAnthropic, agents: { check: a } },
    });
  withAgent({ ...agent, models: ["claude-made-up"] });
  assertStringIncludes(problems(world).join(), "isn't one the app knows");
  withAgent({ ...agent, model: "claude-haiku-5-5", models: ["claude-opus-5-5"] });
  assertStringIncludes(problems(world).join(), "isn't among the models it offers");
  withAgent({
    ...agent,
    model: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5"],
  });
  const registry = JSON.parse(run(world).disk.get("/dist/widgets.next/registry.json") ?? "");
  assertEquals(registry.widgets[0].agents.check.models, [
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]);
});

Deno.test("the registry carries an agent's capabilities, input traits and time limit", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      permissions: toAnthropic,
      agents: {
        check: {
          ...agent,
          maxMinutes: 10,
          input: { private: false, untrusted: false },
          capabilities: [{ use: "web-search", policy: "auto" }, {
            use: "web-fetch",
            policy: "ask",
          }],
        },
      },
    },
  });
  const { disk } = run(world);
  const check =
    JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "").widgets[0].agents.check;
  assertEquals([check.maxMinutes, check.input, check.capabilities.length], [
    10,
    { private: false, untrusted: false },
    2,
  ]);
});

Deno.test("an agent with private data, untrusted content and an automatic way out isn't built", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      permissions: toAnthropic,
      agents: { check: { ...agent, capabilities: [{ use: "web-fetch", policy: "auto" }] } },
    },
  });
  assertStringIncludes(problems(world).join(), 'its agent "check" is too risky');
});

Deno.test("an agent's MCP server must reach a listed service, and widget tools need agent-tools.ts", () => {
  const gmail = {
    use: "mcp",
    server: "gmail",
    tools: ["search"],
    policy: "auto",
    service: "Gmail",
    reads: "private",
    sends: false,
    does: "Reads your email",
  };
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      permissions: toAnthropic,
      agents: { check: { ...agent, capabilities: [gmail] } },
    },
  });
  assertStringIncludes(problems(world).join(), 'must list "Gmail"');

  world.modules.set("/src/clock/manifest.ts", {
    manifest: {
      ...manifest,
      permissions: toAnthropic,
      agents: {
        check: { ...agent, capabilities: [{ use: "widget-tools", policy: "auto", does: "x" }] },
      },
    },
  });
  assertStringIncludes(problems(world).join(), "has no agent-tools.ts");
  world.dirs.set("/src/clock", [...(world.dirs.get("/src/clock") ?? []), {
    name: "agent-tools.ts",
    isDirectory: false,
  }]);
  assertEquals(problems(world), []);
});

const geocodeApi = defineApi("geocode", "main", {}, { services: ["US Census Geocoder"] });
const service = {
  name: "US Census Geocoder",
  sends: "Addresses",
  privacyPolicy: "https://example.com/privacy",
  terms: "https://example.com/terms",
};
const toCensus: Permissions = { services: [service] };
const anthropic: Permissions = { services: [{ ...service, name: "Anthropic (Claude)" }] };
type Overrides = Omit<Partial<WidgetManifest<unknown, unknown>>, "config">;
const apisOf = (overrides: Overrides) =>
  Effect.runSync(Effect.either(apiNames(
    { ...manifest, ...overrides } as WidgetManifest<unknown, unknown>,
    [agentRunsApi, geocodeApi],
  )));

Deno.test("a widget gets the APIs it declares, and agent-runs if it has agents", () => {
  assertEquals(apisOf({}), Either.right([]));
  assertEquals(apisOf({ apis: ["geocode"], permissions: toCensus }), Either.right(["geocode"]));
  assertEquals(
    apisOf({ permissions: anthropic, agents: { check: agent } }),
    Either.right(["agent-runs"]),
  );
});

Deno.test("a widget's APIs must exist, and have their services listed", () => {
  const problem = (overrides: Overrides) =>
    Either.match(apisOf(overrides), { onLeft: (p) => p, onRight: () => "" });
  assertStringIncludes(problem({ apis: ["nope"] }), `an API "nope" there isn't`);
  assertStringIncludes(problem({ apis: ["geocode"] }), `must list "US Census Geocoder"`);
  assertStringIncludes(problem({ apis: ["agent-runs"] }), "by having agents");
});

Deno.test("the registry carries a widget's full-screen size: the whole window unless it says", () => {
  const sizes = (fullScreen: unknown) => {
    const world = worldWith(["clock"]);
    world.modules.set("/src/clock/manifest.ts", {
      manifest: fullScreen === null ? manifest : { ...manifest, fullScreen },
    });
    const registry = run(world).disk.get("/dist/widgets.next/registry.json");
    return registry === undefined ? "no registry" : JSON.parse(registry).widgets[0]?.fullScreen;
  };
  assertEquals(sizes(null), { width: "full", height: "full" });
  assertEquals(sizes({ width: 52, height: "fit" }), { width: 52, height: "fit" });
  // Narrower than 20rem is too narrow to be any use: the manifest is refused.
  assertEquals(sizes({ width: 5, height: "fit" }), "no registry");
});

Deno.test("the registry says whether a rule is drawn below a widget: yes unless it says", () => {
  const rules = (ruleBelow: unknown) => {
    const world = worldWith(["clock"]);
    world.modules.set("/src/clock/manifest.ts", {
      manifest: ruleBelow === null ? manifest : { ...manifest, ruleBelow },
    });
    const registry = run(world).disk.get("/dist/widgets.next/registry.json");
    return registry === undefined ? "no registry" : JSON.parse(registry).widgets[0]?.ruleBelow;
  };
  assertEquals(rules(null), true);
  assertEquals(rules(false), false);
  assertEquals(rules("no"), "no registry");
});

Deno.test("the registry carries a widget's APIs", () => {
  const world = worldWith(["clock"]);
  world.modules.set("/src/clock/manifest.ts", {
    manifest: { ...manifest, permissions: toAnthropic, agents: { check: agent } },
  });
  const { disk } = run(world);
  assertEquals(
    JSON.parse(disk.get("/dist/widgets.next/registry.json") ?? "").widgets[0].apis,
    ["agent-runs"],
  );
});
