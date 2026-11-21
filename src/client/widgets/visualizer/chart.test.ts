import { assert, assertEquals } from "@std/assert";
import { Either } from "effect";
import { deepMerge, forbidden, isComposite, prepareSpec, renderChart } from "./chart.ts";

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

Deno.test("a spec is prepared with the dump, the variant's size and the widget's look", () => {
  const ok = Either.getOrThrow(
    prepareSpec({ ...bar, title: "x", config: { axis: { grid: false } } }, "column"),
  );
  assertEquals([ok["data"], ok["width"], ok["title"]], [{ name: "dump" }, 408, undefined]);
  assertEquals((ok["config"] as { axis: { grid: boolean } }).axis.grid, false);
  assertEquals("width" in Either.getOrThrow(prepareSpec({ facet: {}, spec: bar }, "full")), false);
  assert(Either.isLeft(prepareSpec([], "full")));
});

Deno.test("a spec renders as SVG at each size, and a bad one says why", async () => {
  const column = Either.getOrThrow(await renderChart(bar, rows, "column"));
  assert(column.svg.startsWith("<svg"));
  assert(column.svg.includes('width="408"'));
  assert(column.svg.includes("north"));
  const full = Either.getOrThrow(await renderChart(bar, rows, "full"));
  assert(full.svg.includes('width="960"'));
  const bad = await renderChart(
    { mark: "bar", encoding: { x: { field: "a", type: "x" } } },
    rows,
    "column",
  );
  assert(Either.isLeft(bad));
  assert(Either.isLeft(await renderChart({ ...bar, data: { url: "a" } }, rows, "column")));
});
