import { assertEquals } from "@std/assert";
import { nudge } from "./rows.ts";

Deno.test("nudge moves items up and down, ignoring unknown ids", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assertEquals(nudge(items, "b", -1).map((x) => x.id), ["b", "a", "c"]);
  assertEquals(nudge(items, "b", 1).map((x) => x.id), ["a", "c", "b"]);
  assertEquals(nudge(items, "a", -1).map((x) => x.id), ["a", "b", "c"]);
  assertEquals(nudge(items, "z", 1), items);
});
