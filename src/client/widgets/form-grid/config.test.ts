import { assertEquals } from "@std/assert";
import { checkConfig, type FormGridConfig } from "./config.ts";

Deno.test("checkConfig requires the placeholder in every template", () => {
  const good: FormGridConfig = {
    gridColumns: 1,
    fields: [{ id: "f", label: "Q", urlTemplate: "https://x/{query}" }],
  };
  assertEquals(checkConfig(good), { ok: true, config: good });
  const bad: FormGridConfig = {
    gridColumns: 1,
    fields: [{ id: "f", label: "", urlTemplate: "https://x/" }],
  };
  assertEquals(checkConfig(bad), {
    ok: false,
    errorMessage: `"Untitled": URL template must contain {query}`,
  });
});
