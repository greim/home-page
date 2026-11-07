import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Either, Schema } from "effect";
import { emptyLayout, type Layout, newColumn } from "../src/common/model.ts";
import { decodeManifestModule, defineManifest } from "../src/common/widgets.ts";
import { configProblems, type LoadedType, loadTypes, typesUsed } from "./layout-check.ts";
import { BuildIoError, WidgetBuildIo } from "./widget-build.ts";

const clock = defineManifest({
  title: "Clock",
  description: "Shows the time.",
  config: Schema.Struct({ timeZone: Schema.NullOr(Schema.String) }),
  defaultConfig: { timeZone: null },
});
/** As a manifest module's loaded. */
const clockType = decodeManifestModule({ manifest: clock });

const layoutWith = (...widgets: ReadonlyArray<{ is: string; config: unknown }>): Layout => ({
  ...emptyLayout,
  columns: [{
    ...newColumn("c1", "LuStar"),
    heading: "Home",
    widgets: widgets.map((w, i) => ({
      id: `w${i + 1}`,
      ...w,
    })),
  }],
});

Deno.test("widget configs are decoded with their types' schemas", () => {
  const types = new Map<string, LoadedType>([
    ["clock", clockType],
    ["broken", Either.left("its manifest is invalid: title is missing")],
  ]);
  const layout = layoutWith(
    { is: "clock", config: { timeZone: "UTC" } },
    { is: "clock", config: { heading: "Time", timeZone: 3 } },
    { is: "ticker", config: {} },
    { is: "broken", config: {} },
  );
  assertEquals(typesUsed(layout), ["clock", "ticker", "broken"]);
  const problems = configProblems(layout, types);
  assertEquals(problems.length, 3);
  assertStringIncludes(problems[0] ?? "", `Widget w2 ("Time") in column c1 ("Home"): its config`);
  assertStringIncludes(
    problems[1] ?? "",
    `Widget w3 in column c1 ("Home"): there's no widget type "ticker"`,
  );
  assertStringIncludes(problems[2] ?? "", "title is missing");
});

/** Why a type couldn't be loaded, or "" if it was. */
const whyNot = (type: LoadedType | undefined): string =>
  type !== undefined && Either.isLeft(type) ? type.left : "";

Deno.test("types are loaded from their folders' manifests; a type without a folder isn't", async () => {
  const imported: Array<string> = [];
  const io = WidgetBuildIo.of({
    listDir: () =>
      Effect.succeed([
        { name: "clock", isDirectory: true },
        { name: "bad", isDirectory: true },
        { name: "throws", isDirectory: true },
      ]),
    importModule: (path) =>
      Effect.suspend(() => {
        imported.push(path);
        return path.includes("throws")
          ? Effect.fail(new BuildIoError({ cause: new Error("SyntaxError") }))
          : Effect.succeed(path.includes("clock") ? { manifest: clock } : {});
      }),
    makeDir: () => Effect.die("unused"),
    writeFile: () => Effect.die("unused"),
    remove: () => Effect.die("unused"),
    rename: () => Effect.die("unused"),
  });
  const types = await Effect.runPromise(
    loadTypes("/w", ["clock", "bad", "throws", "ticker"]).pipe(
      Effect.provideService(WidgetBuildIo, io),
    ),
  );
  assertEquals(imported, ["/w/clock/manifest.ts", "/w/bad/manifest.ts", "/w/throws/manifest.ts"]);
  assertEquals(types.get("clock"), clockType);
  assertStringIncludes(whyNot(types.get("bad")), "manifest is invalid");
  assertStringIncludes(whyNot(types.get("throws")), "SyntaxError");
  assertEquals(types.has("ticker"), false);
});
