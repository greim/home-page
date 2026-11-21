import { assert, assertEquals, assertRejects } from "@std/assert";
import type { RunFolder } from "../../../common/agent-tools.ts";
import { specObject, tools } from "./agent-tools.ts";

const runFolder = async (data: unknown | null): Promise<RunFolder> => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/in`);
  if (data !== null) await Deno.writeTextFile(`${dir}/in/data.json`, JSON.stringify(data));
  return { dir, path: (relative) => `${dir}/${relative}` };
};

const bar = {
  mark: "bar",
  encoding: { x: { field: "k", type: "nominal" }, y: { field: "v", type: "quantitative" } },
};

Deno.test("the tools summarize the data and render the chart into out/", async () => {
  const folder = await runFolder([{ k: "a", v: 1 }, { k: "b", v: 2 }]);
  const summary = await tools.data_overview.run({}, folder) as { rows: number };
  assertEquals(summary.rows, 2);
  const result = await tools.render_chart.run({ spec: bar }, folder);
  assertEquals(result, { rendered: true, rows: 2, warnings: [] });
  assert((await Deno.readTextFile(folder.path("out/chart.svg"))).startsWith("<svg"));
  assertEquals(JSON.parse(await Deno.readTextFile(folder.path("out/spec.json"))), bar);
  await assertRejects(() => tools.render_chart.run({ spec: { mark: "image" } }, folder));
  // A spec sent as JSON text is parsed.
  await tools.render_chart.run({ spec: JSON.stringify(bar) }, folder);
  assertEquals(JSON.parse(await Deno.readTextFile(folder.path("out/spec.json"))), bar);
  assertEquals(specObject("{oops"), "{oops");
  await Deno.remove(folder.dir, { recursive: true });
});

Deno.test("data read from text is passed in, and kept", async () => {
  const folder = await runFolder(null);
  await assertRejects(() => tools.data_overview.run({}, folder), Error, "came as text");
  await assertRejects(() => tools.render_chart.run({ spec: bar }, folder), Error, "pass the rows");
  await tools.render_chart.run({ spec: bar, rows: [{ k: "a", v: 1 }] }, folder);
  assertEquals(JSON.parse(await Deno.readTextFile(folder.path("out/data.json"))), [
    { k: "a", v: 1 },
  ]);
  await Deno.remove(folder.dir, { recursive: true });
});
