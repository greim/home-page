import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import { emptyLayout, type Layout, newColumn } from "../../../common/model.ts";
import type { LoadedType } from "../../../common/widget-configs.ts";
import { decodeManifestModule, defineManifest } from "../../../common/widgets.ts";
import {
  checkLayout,
  describeTypes,
  findIcons,
  iconNames,
  layoutFileText,
  maxIcons,
  readLayout,
} from "./catalog.ts";

const clock = decodeManifestModule({
  manifest: defineManifest({
    title: "Clock",
    description: "Shows the time.",
    config: Schema.Struct({ timeZone: Schema.NullOr(Schema.String) }),
    defaultConfig: { timeZone: null },
  }),
});

const types = new Map<string, LoadedType>([
  ["clock", clock],
  ["broken", Either.left("its manifest wouldn't load")],
]);

Deno.test("loaded widget types are described with their config schemas; broken ones left out", () => {
  const described = describeTypes(types);
  assertEquals(described.map((t) => [t.id, t.title, t.defaultConfig]), [
    ["clock", "Clock", { timeZone: null }],
  ]);
  assertEquals(typeof described.at(0)?.configSchema, "object");
});

Deno.test("icon names are read from react-icons' declarations, and found by words", () => {
  const names = iconNames(
    "export declare const LuMusic: IconType;\nexport declare const LuListMusic: IconType;\n" +
      "export declare const LuCalendarDays: IconType;\nexport declare const Other: IconType;",
  );
  assertEquals(names, ["LuMusic", "LuListMusic", "LuCalendarDays"]);
  assertEquals(findIcons(names, "music"), ["LuMusic", "LuListMusic"]);
  assertEquals(findIcons(names, "Calendar days"), ["LuCalendarDays"]);
  const many = Array.from({ length: 100 }, (_, i) => `LuStar${i}`);
  assertEquals(findIcons(many, "star").length, maxIcons);
});

const layout: Layout = {
  ...emptyLayout,
  columns: [{
    ...newColumn("c1", "LuMusic"),
    widgets: [{ id: "w1", is: "clock", config: { timeZone: "UTC" } }],
  }],
};
const icons = new Set(["LuMusic"]);

Deno.test("a layout is read from its file, or says what's wrong with it", () => {
  assertEquals(readLayout(layoutFileText(layout)), Either.right(layout));
  assertStringIncludes(Either.getLeft(readLayout("{")).pipe((l) => String(l)), "isn't valid JSON");
  assert(Either.isLeft(readLayout('{"version":2}')));
});

Deno.test("a good layout passes, with warnings for colors past their hue's reach", () => {
  assertEquals(checkLayout(layout, types, icons), { ok: true, layout, warnings: [] });
  const vivid: Layout = {
    ...layout,
    columns: layout.columns.map((c) => ({ ...c, color: { c: 0.39, h: 250 } })),
  };
  const checked = checkLayout(vivid, types, icons);
  assert(checked.ok);
  assertStringIncludes(checked.warnings.at(0) ?? "", "chroma 0.39 is more than hue 250 reaches");
});

Deno.test("duplicate ids, unknown icons and bad configs are problems", () => {
  const bad: Layout = {
    ...layout,
    columns: [{
      ...newColumn("w1", "LuNope"),
      widgets: [{ id: "w1", is: "clock", config: { timeZone: 3 } }],
    }],
  };
  const checked = checkLayout(bad, types, icons);
  assert(!checked.ok);
  assertEquals(checked.problems.length, 3);
  assertStringIncludes(checked.problems[0] ?? "", `"w1" is used more than once`);
  assertStringIncludes(checked.problems[1] ?? "", `no icon "LuNope"`);
  assertStringIncludes(checked.problems[2] ?? "", "its config is invalid");
});
