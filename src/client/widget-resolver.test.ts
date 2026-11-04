import { assertEquals, assertRejects } from "@std/assert";
import { Either } from "effect";
import type { Registry } from "../common/widgets.ts";
import { registryResolver } from "./widget-resolver.ts";

const registry: Registry = {
  widgets: [{ id: "clock", title: "Clock", description: "", version: "v1", configSchema: {} }],
};

Deno.test("registryResolver finds a widget's versioned bundle URL", async () => {
  const resolve = registryResolver(Promise.resolve(Either.right(registry)));
  assertEquals(await resolve("clock"), "/web/assets/widgets/clock/main.js?v=v1");
});

Deno.test("registryResolver fails for a widget type that isn't there", async () => {
  const resolve = registryResolver(Promise.resolve(Either.right(registry)));
  await assertRejects(
    () => Promise.resolve(resolve("gone")),
    Error,
    `no widget type called "gone"`,
  );
});

Deno.test("registryResolver fails when the registry couldn't be loaded", async () => {
  const resolve = registryResolver(Promise.resolve(Either.left("Server responded 500")));
  await assertRejects(() => Promise.resolve(resolve("clock")), Error, "Server responded 500");
});
