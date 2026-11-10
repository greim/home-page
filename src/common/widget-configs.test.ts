import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import { emptyLayout, type Layout, newColumn } from "./model.ts";
import { configProblems, duplicateIds, type LoadedType, typesUsed } from "./widget-configs.ts";
import { decodeManifestModule, defineManifest } from "./widgets.ts";

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

Deno.test("ids used more than once are found, columns' and widgets' alike", () => {
  const layout = layoutWith({ is: "clock", config: {} }, { is: "clock", config: {} });
  assertEquals(duplicateIds(layout), []);
  const clash: Layout = {
    ...layout,
    columns: [...layout.columns, {
      ...newColumn("w1", "LuSun"),
      widgets: layout.columns[0]?.widgets ?? [],
    }],
  };
  assertEquals(duplicateIds(clash), ["w1", "w2"]);
});
