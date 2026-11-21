import { assert, assertEquals } from "@std/assert";
import { Either } from "effect";
import { renderChart } from "./chart.ts";
import { deepMerge, forbidden, isComposite, prepareSpec } from "./spec.ts";

const rows = [
  { month: "2024-01-01", sales: 3, region: "north" },
  { month: "2024-02-01", sales: 7, region: "south" },
];
const bar = {
  mark: "bar",
  encoding: {
    x: { field: "region", type: "nominal" },
    y: { field: "sales", type: "quantitative" },
  },
};

Deno.test("merging replaces values and merges objects key by key", () => {
  assertEquals(deepMerge({ a: 1, b: { c: 1, d: 1 } }, { b: { d: 2 }, e: 3 }), {
    a: 1,
    b: { c: 1, d: 2 },
    e: 3,
  });
});

Deno.test("specs may not load, link or show images", () => {
  assert(forbidden({ layer: [{ data: { url: "x.csv" } }] })?.includes("url"));
  assert(forbidden({ encoding: { href: { field: "a" } } })?.includes("href"));
  assert(forbidden({ mark: "image" })?.includes("images"));
  assert(forbidden({ mark: { type: "image" } })?.includes("images"));
  assertEquals(forbidden(bar), null);
});

Deno.test("composite specs are recognized", () => {
  assert(isComposite({ facet: {} }));
  assert(isComposite({ encoding: { row: {} } }));
  assert(!isComposite(bar));
});

Deno.test("a spec is prepared with the dump, the chart's size and the widget's look", () => {
  const ok = Either.getOrThrow(
    prepareSpec({ ...bar, title: "x", config: { axis: { grid: false } } }),
  );
  assertEquals([ok["data"], ok["width"], ok["title"]], [{ name: "dump" }, 960, undefined]);
  assertEquals((ok["config"] as { axis: { grid: boolean } }).axis.grid, false);
  assertEquals("width" in Either.getOrThrow(prepareSpec({ facet: {}, spec: bar })), false);
  assert(Either.isLeft(prepareSpec([])));
});

Deno.test("a spec renders as SVG at the chart's size, and a bad one says why", async () => {
  const chart = Either.getOrThrow(await renderChart(bar, rows));
  assert(chart.svg.startsWith("<svg"));
  assert(chart.svg.includes('width="960"'));
  assert(chart.svg.includes("north"));
  const bad = await renderChart(
    { mark: "bar", encoding: { x: { field: "a", type: "x" } } },
    rows,
  );
  assert(Either.isLeft(bad));
  assert(Either.isLeft(await renderChart({ ...bar, data: { url: "a" } }, rows)));
});
