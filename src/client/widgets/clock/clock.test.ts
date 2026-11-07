import { assertEquals } from "@std/assert";
import { clockParts } from "./clock.ts";

// Local times, so the tests hold in any time zone.
const at = (month: number, date: number, hours: number, minutes: number) =>
  new Date(2026, month, date, hours, minutes);

Deno.test("clockParts shows the year, short month, day and 12-hour time", () => {
  assertEquals(clockParts(at(10, 6, 15, 28)), ["2026", "Nov", "6", "3:28 pm"]);
  assertEquals(clockParts(at(0, 31, 9, 5)), ["2026", "Jan", "31", "9:05 am"]);
});

Deno.test("clockParts shows midnight and noon as 12", () => {
  assertEquals(clockParts(at(11, 25, 0, 0)).at(3), "12:00 am");
  assertEquals(clockParts(at(11, 25, 12, 0)).at(3), "12:00 pm");
  assertEquals(clockParts(at(11, 25, 23, 59)).at(3), "11:59 pm");
});
