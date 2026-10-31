import { assertAlmostEquals, assertEquals } from "@std/assert";
import { appearanceFor, luminance } from "./contrast.ts";

Deno.test("luminance spans black to white", () => {
  assertEquals(luminance("#000000"), 0);
  assertAlmostEquals(luminance("#ffffff"), 1);
  assertAlmostEquals(luminance("#808080"), 0.2159, 0.001);
});

Deno.test("appearanceFor uses dark UI on dark backgrounds", () => {
  assertEquals(appearanceFor("#ffffff"), "light");
  assertEquals(appearanceFor("#f7f3ea"), "light");
  assertEquals(appearanceFor("#2b2d33"), "dark");
  assertEquals(appearanceFor("#1f2a3a"), "dark");
  assertEquals(appearanceFor("#000000"), "dark");
});

Deno.test("appearanceFor treats mid-tones by which text contrasts better", () => {
  assertEquals(appearanceFor("#ffcc00"), "light"); // bright yellow → dark text
  assertEquals(appearanceFor("#0050c8"), "dark"); // strong blue → light text
});
