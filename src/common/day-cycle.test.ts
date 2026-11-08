import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import {
  daysOfWeek,
  defaultSchedule,
  defaultWeekend,
  nextChange,
  phaseAt,
  Schedule,
  untilNextMinute,
  type Workday,
  workdayAt,
} from "./day-cycle.ts";

// Local times, so the tests hold in any time zone. November 2026: the 2nd is a
// Monday, the 6th a Friday, the 7th and 8th the weekend.
const at = (date: number, hours: number, minutes = 0) => new Date(2026, 10, date, hours, minutes);

const decode = Schema.decodeUnknownEither(Schedule);

Deno.test("Schedule accepts HH:MM times with the day starting first", () => {
  assertEquals(decode(defaultSchedule), Either.right(defaultSchedule));
  const late = { startOfDay: "07:30", endOfDay: "23:59", weekend: { is: "none" } } as const;
  assertEquals(decode(late), Either.right(late));
});

Deno.test("Schedules saved before the weekend was settable get Saturday and Sunday", () => {
  assertEquals(
    decode({ startOfDay: "07:30", endOfDay: "15:30" }),
    Either.right({ startOfDay: "07:30", endOfDay: "15:30", weekend: defaultWeekend }),
  );
});

Deno.test("Schedule rejects a weekend with no days, every day, a repeat or an unknown day", () => {
  for (
    const days of [[], [...daysOfWeek], ["saturday", "saturday"], ["sat"]]
  ) {
    const schedule = { ...defaultSchedule, weekend: { is: "days", days } };
    assertEquals(Either.isLeft(decode(schedule)), true, JSON.stringify(days));
  }
});

Deno.test("Schedule rejects malformed times and days that don't start before they end", () => {
  for (
    const bad of [
      { startOfDay: "9:00", endOfDay: "17:00" },
      { startOfDay: "09:00", endOfDay: "24:00" },
      { startOfDay: "09:60", endOfDay: "17:00" },
      { startOfDay: "17:00", endOfDay: "09:00" },
      { startOfDay: "09:00", endOfDay: "09:00" },
    ]
  ) {
    assertEquals(Either.isLeft(decode(bad)), true, JSON.stringify(bad));
  }
});

Deno.test("phaseAt is day from the start of day until (not including) its end", () => {
  assertEquals(phaseAt(at(6, 8, 59), defaultSchedule), "night");
  assertEquals(phaseAt(at(6, 9), defaultSchedule), "day");
  assertEquals(phaseAt(at(6, 16, 59), defaultSchedule), "day");
  assertEquals(phaseAt(at(6, 17), defaultSchedule), "night");
  assertEquals(phaseAt(at(6, 0), defaultSchedule), "night");
});

Deno.test("phaseAt ignores the day of the week", () => {
  assertEquals(phaseAt(at(7, 12), defaultSchedule), "day");
  assertEquals(phaseAt(at(8, 20), defaultSchedule), "night");
});

const summary = (w: Workday) => ({
  is: w.is,
  start: w.start.getTime(),
  end: w.end.getTime(),
  progress: Math.round(w.progress * 1000) / 1000,
});

const expected = (is: Workday["is"], start: Date, end: Date, progress: number) => ({
  is,
  start: start.getTime(),
  end: end.getTime(),
  progress,
});

Deno.test("workdayAt is a workday within a weekday's day", () => {
  assertEquals(
    summary(workdayAt(at(6, 15, 24), defaultSchedule)),
    expected("workday", at(6, 9), at(6, 17), 0.8),
  );
  assertEquals(
    summary(workdayAt(at(2, 9), defaultSchedule)),
    expected("workday", at(2, 9), at(2, 17), 0),
  );
});

Deno.test("workdayAt is after hours between successive weekdays", () => {
  // Thursday 17:00 → Friday 09:00 is 16 hours.
  assertEquals(
    summary(workdayAt(at(5, 17), defaultSchedule)),
    expected("after-hours", at(5, 17), at(6, 9), 0),
  );
  assertEquals(
    summary(workdayAt(at(6, 1), defaultSchedule)),
    expected("after-hours", at(5, 17), at(6, 9), 0.5),
  );
  // Monday before work follows Friday's end: that's still the weekend.
  assertEquals(workdayAt(at(9, 8, 59), defaultSchedule).is, "weekend");
  // Tuesday before work follows Monday's.
  assertEquals(
    summary(workdayAt(at(3, 5), defaultSchedule)),
    expected("after-hours", at(2, 17), at(3, 9), 0.75),
  );
});

Deno.test("workdayAt is the weekend from Friday's end of day until Monday's start", () => {
  const weekend = (now: Date) => summary(workdayAt(now, defaultSchedule));
  // Friday 17:00 → Monday 09:00 is 64 hours.
  assertEquals(weekend(at(6, 17)), expected("weekend", at(6, 17), at(9, 9), 0));
  assertEquals(weekend(at(8, 1)), expected("weekend", at(6, 17), at(9, 9), 0.5));
  // Saturday daytime is part of the weekend, not a workday.
  assertEquals(weekend(at(7, 12)).is, "weekend");
});

Deno.test("workdayAt follows the user's schedule", () => {
  const schedule = { ...defaultSchedule, startOfDay: "07:30", endOfDay: "15:30" };
  assertEquals(workdayAt(at(6, 7, 29), schedule).is, "after-hours");
  assertEquals(
    summary(workdayAt(at(6, 11, 30), schedule)),
    expected("workday", at(6, 7, 30), at(6, 15, 30), 0.5),
  );
});

Deno.test("workdayAt follows the user's weekend days", () => {
  // Friday and Saturday off: Sunday is a workday, and Thursday's end starts the weekend.
  const schedule = {
    ...defaultSchedule,
    weekend: { is: "days", days: ["friday", "saturday"] },
  } as const;
  assertEquals(
    summary(workdayAt(at(8, 12), schedule)),
    expected("workday", at(8, 9), at(8, 17), 0.375),
  );
  assertEquals(
    summary(workdayAt(at(6, 12), schedule)),
    expected("weekend", at(5, 17), at(8, 9), 0.297),
  );
  // Sunday night into Monday is after hours.
  assertEquals(workdayAt(at(8, 20), schedule).is, "after-hours");
});

Deno.test("workdayAt splits the week around a single midweek day off", () => {
  const schedule = { ...defaultSchedule, weekend: { is: "days", days: ["wednesday"] } } as const;
  // Tuesday the 3rd's end until Thursday the 5th's start.
  assertEquals(
    summary(workdayAt(at(4, 12), schedule)),
    expected("weekend", at(3, 17), at(5, 9), 0.475),
  );
  assertEquals(workdayAt(at(7, 12), schedule).is, "workday");
});

Deno.test("workdayAt is never the weekend without a set weekend", () => {
  const schedule = { ...defaultSchedule, weekend: { is: "none" } } as const;
  assertEquals(
    summary(workdayAt(at(7, 13), schedule)),
    expected("workday", at(7, 9), at(7, 17), 0.5),
  );
  // Friday night into Saturday is just after hours.
  assertEquals(
    summary(workdayAt(at(6, 17), schedule)),
    expected("after-hours", at(6, 17), at(7, 9), 0),
  );
});

Deno.test("nextChange is the next start or end of day", () => {
  const next = (now: Date) => nextChange(now, defaultSchedule).getTime();
  assertEquals(next(at(6, 3)), at(6, 9).getTime());
  assertEquals(next(at(6, 9)), at(6, 17).getTime());
  assertEquals(next(at(6, 12)), at(6, 17).getTime());
  assertEquals(next(at(6, 17)), at(7, 9).getTime());
  assertEquals(next(at(6, 23, 59)), at(7, 9).getTime());
});

Deno.test("untilNextMinute counts down to the minute", () => {
  assertEquals(untilNextMinute(new Date("2026-11-03T12:05:30Z")), 30_000);
  assertEquals(untilNextMinute(new Date("2026-11-03T12:06:00Z")), 60_000);
});
