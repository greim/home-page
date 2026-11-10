import { assertEquals, assertStrictEquals } from "@std/assert";
import type { LayoutApi } from "../common/apis/layout.ts";
import { defaultLayout, emptyLayout, type Layout } from "../common/model.ts";
import type { ApiClient } from "../common/widget-apis.ts";
import { hearAppliedLayouts } from "./layout-applied.ts";

const fakeLayoutApi = (applied: boolean): ApiClient<LayoutApi> => ({
  get: () => Promise.resolve({ ok: true, value: defaultLayout }),
  apply: ({ layout }) =>
    Promise.resolve(
      applied
        ? { ok: true, value: layout }
        : { ok: false, error: { is: "layout-changed", message: "changed" } },
    ),
});

Deno.test("APIs without the layout API are left as they are", () => {
  const apis = { "agent-runs": {} };
  assertStrictEquals(hearAppliedLayouts(apis, () => {}), apis);
});

Deno.test("the page hears each layout a widget applies, and only those", async () => {
  const heard: Array<Layout> = [];
  for (const applied of [true, false]) {
    const apis = hearAppliedLayouts(
      { layout: fakeLayoutApi(applied) },
      (layout) => heard.push(layout),
    );
    const client = apis.layout as ApiClient<LayoutApi>;
    const result = await client.apply({ base: defaultLayout, layout: emptyLayout });
    assertEquals(result.ok, applied);
    assertEquals((await client.get({})).ok, true);
  }
  assertEquals(heard, [emptyLayout]);
});
