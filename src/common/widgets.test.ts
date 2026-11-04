import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import { decodeManifestModule, defineManifest, type Registry, widgetBundleUrl } from "./widgets.ts";

const manifest = defineManifest({
  title: "Clock",
  description: "Shows the time",
  config: Schema.Struct({ zone: Schema.String }),
});

Deno.test("decodeManifestModule accepts a module exporting a manifest", () => {
  const decoded = decodeManifestModule({ manifest });
  assertEquals(Either.isRight(decoded) && decoded.right.config === manifest.config, true);
});

Deno.test("decodeManifestModule says what's wrong with a bad manifest", async (t) => {
  const failure = (module: unknown) => {
    const result = decodeManifestModule(module);
    return Either.isLeft(result) ? result.left : "decoded";
  };
  await t.step("no manifest export", () => {
    assertStringIncludes(failure({}), "manifest");
  });
  await t.step("a blank title", () => {
    assertStringIncludes(failure({ manifest: { ...manifest, title: " " } }), "title");
  });
  await t.step("a config that isn't a schema", () => {
    assertStringIncludes(
      failure({ manifest: { ...manifest, config: { zone: "string" } } }),
      "Schema",
    );
  });
});

Deno.test("widgetBundleUrl versions the URL from the registry", () => {
  const registry: Registry = {
    widgets: [{ id: "clock", title: "", description: "", version: "abc", configSchema: {} }],
  };
  assertEquals(widgetBundleUrl(registry, "clock"), "/web/assets/widgets/clock/main.js?v=abc");
  assertEquals(widgetBundleUrl(registry, "gone"), "/web/assets/widgets/gone/main.js?v=unknown");
});
