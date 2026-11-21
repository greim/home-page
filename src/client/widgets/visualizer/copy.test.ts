import { assert, assertEquals } from "@std/assert";
import { newChart } from "./charts.ts";
import { originalData, standaloneSpec, standaloneSvg } from "./copy.ts";
import { palette } from "./palette.ts";

const rows = [{ k: "a", v: 1 }];
const chart = {
  ...newChart({
    id: "c",
    widgetId: "w",
    data: { is: "rows", format: "CSV", rows },
    original: "k,v\na,1",
    image: null,
    now: 0,
  }),
  title: "Things",
};
const version = {
  spec: { mark: "bar", title: "dropped", encoding: { x: { field: "k", type: "nominal" } } },
  svg: '<svg width="960"><g/></svg>',
};

Deno.test("the SVG copy stands on the charts' surface", () => {
  assertEquals(
    standaloneSvg(version.svg),
    `<svg width="960"><rect width="100%" height="100%" fill="${palette.surface}"/><g/></svg>`,
  );
});

Deno.test("the Vega-Lite copy is whole: data, title, size and look", () => {
  const spec = JSON.parse(standaloneSpec(chart, version));
  assert(String(spec.$schema).includes("vega-lite/v6"));
  assertEquals([spec.title, spec.data, spec.width, spec.mark], [
    "Things",
    { values: rows },
    960,
    "bar",
  ]);
  assertEquals(spec.config.background, palette.surface);
  assertEquals(spec.config.font, '"Google Sans", sans-serif');
  const fromText = { ...chart, data: { is: "text", format: "text", text: "x" } as const };
  assertEquals(JSON.parse(standaloneSpec(fromText, { ...version, spec: [] })).data, { values: [] });
});

Deno.test("the original data is what was pasted, or the rows for charts kept before", () => {
  assertEquals(originalData(chart), "k,v\na,1");
  assertEquals(originalData({ ...chart, original: "" }), JSON.stringify(rows, null, 2));
  assertEquals(
    originalData({ ...chart, original: "", data: { is: "text", format: "text", text: "t" } }),
    "t",
  );
  const image = { is: "image", format: "a PNG image", type: "image/png" } as const;
  assertEquals(originalData({ ...chart, original: "", data: image }), "");
});
