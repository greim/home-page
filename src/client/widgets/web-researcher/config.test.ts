import { assertEquals } from "@std/assert";
import { isWebLink, siteOf } from "./config.ts";

Deno.test("a source's site is its host, without www", () => {
  assertEquals(siteOf("https://www.example.com/a?b"), "example.com");
  assertEquals(siteOf("http://docs.deno.com"), "docs.deno.com");
  assertEquals(siteOf("not a url"), "");
});

Deno.test("only http(s) links are links", () => {
  assertEquals(isWebLink("https://example.com"), true);
  assertEquals(isWebLink("javascript:alert(1)"), false);
  assertEquals(isWebLink("file:///etc/hosts"), false);
});
