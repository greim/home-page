import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either } from "effect";
import { decodeConfig, formatClock, untilNextMinute } from "./clock.ts";

const noon = new Date("2026-11-03T12:05:30Z");

Deno.test("formatClock shows the time and date in the chosen zone", () => {
  assertEquals(
    formatClock(noon, "Europe/London", "en-US"),
    Either.right({ time: "12:05 PM", date: "Tuesday, November 3", zone: "Europe/London" }),
  );
  assertEquals(
    Either.map(formatClock(noon, "Asia/Tokyo", "en-US"), (f) => [f.time, f.date]),
    Either.right(["9:05 PM", "Tuesday, November 3"]),
  );
});

Deno.test("formatClock uses the computer's zone when none is chosen", () => {
  const face = formatClock(noon, null, "en-US");
  assertEquals(
    Either.map(face, (f) => f.zone),
    Either.right(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
});

Deno.test("formatClock fails for a zone that doesn't exist", () => {
  assertEquals(
    formatClock(noon, "Mars/Olympus", "en-US"),
    Either.left(`"Mars/Olympus" isn't a time zone`),
  );
});

Deno.test("decodeConfig reads the config from the props", () => {
  assertEquals(decodeConfig({ config: { timeZone: null } }), Either.right({ timeZone: null }));
  const bad = decodeConfig({ config: { timeZone: 5 } });
  assertStringIncludes(Either.isLeft(bad) ? bad.left : "", "settings are invalid");
});

Deno.test("untilNextMinute counts down to the minute", () => {
  assertEquals(untilNextMinute(noon), 30_000);
  assertEquals(untilNextMinute(new Date("2026-11-03T12:06:00Z")), 60_000);
});
