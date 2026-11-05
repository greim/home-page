import { assertEquals } from "@std/assert";
import { fillUrlTemplate } from "./url-template.ts";

Deno.test("fillUrlTemplate encodes and inlines the trimmed value", () => {
  assertEquals(
    fillUrlTemplate("https://x.test/search?q={query}", "  a b&c "),
    { ok: true, url: "https://x.test/search?q=a%20b%26c" },
  );
});

Deno.test("fillUrlTemplate replaces every placeholder", () => {
  assertEquals(fillUrlTemplate("https://x.test/{query}/{query}", "z"), {
    ok: true,
    url: "https://x.test/z/z",
  });
});

Deno.test("fillUrlTemplate rejects empty input", () => {
  assertEquals(fillUrlTemplate("https://x.test/{query}", "   ").ok, false);
});

Deno.test("fillUrlTemplate rejects templates without a placeholder", () => {
  assertEquals(fillUrlTemplate("https://x.test/", "z").ok, false);
});

Deno.test("fillUrlTemplate rejects results that are not URLs", () => {
  assertEquals(fillUrlTemplate("not a url {query}", "z").ok, false);
});
