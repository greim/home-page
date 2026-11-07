import { assertEquals } from "@std/assert";
import { dayPreviewAvailable, nextNightView, showsNight } from "./night-mode.ts";

Deno.test("night shows at night, unless daytime is previewed in admin mode", () => {
  assertEquals(showsNight("night", false, false), true);
  assertEquals(showsNight("night", true, false), true);
  assertEquals(showsNight("night", true, true), false);
  // Outside admin mode, a leftover preview counts for nothing.
  assertEquals(showsNight("night", false, true), true);
  assertEquals(showsNight("day", true, true), false);
  assertEquals(showsNight("day", false, false), false);
});

Deno.test("the day preview is offered only at night", () => {
  assertEquals(dayPreviewAvailable("night"), true);
  assertEquals(dayPreviewAvailable("day"), false);
});

const nightView = { night: true, phase: "night", quick: false } as const;

Deno.test("the day ending or beginning changes the view slowly", () => {
  const dusk = nextNightView({ night: false, phase: "day", quick: true }, nightView);
  assertEquals(dusk, { night: true, phase: "night", quick: false });
  assertEquals(nextNightView(nightView, { night: false, phase: "day" }).quick, false);
});

Deno.test("previewing daytime, or ending the preview, changes the view quickly", () => {
  const preview = nextNightView(nightView, { night: false, phase: "night" });
  assertEquals(preview, { night: false, phase: "night", quick: true });
  assertEquals(nextNightView(preview, { night: true, phase: "night" }).quick, true);
});

Deno.test("the last change's speed stands while what's shown stays the same", () => {
  const preview = { night: false, phase: "night", quick: true } as const;
  // Day begins mid-preview: still showing day, so nothing changes, quickly or not.
  assertEquals(nextNightView(preview, { night: false, phase: "day" }), {
    night: false,
    phase: "day",
    quick: true,
  });
});
