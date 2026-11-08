/**
 * The user's day: when it starts and ends, and what that makes any moment. The
 * page uses it for night mode, and widgets (the clock, the workday bar) to show
 * where in the day or week it is. All times are the computer's local time.
 */
import { Schema } from "effect";

/** A local time of day, as 24-hour `HH:MM`, e.g. "09:00" or "17:30". */
export const TimeOfDay = Schema.String.pipe(
  Schema.pattern(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: () => "Expected a time of day like 09:00 or 17:30",
  }),
);
export type TimeOfDay = typeof TimeOfDay.Type;

/** The days of the week, in the order `Date.getDay()` numbers them (Sunday is 0). */
export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export const DayOfWeek = Schema.Literal(...daysOfWeek);
export type DayOfWeek = typeof DayOfWeek.Type;

/**
 * Which days the user takes off each week, or that they keep no set weekend (so
 * every day is a workday). A weekend has at least one day, and leaves at least
 * one workday.
 */
export const Weekend = Schema.Union(
  Schema.Struct({
    is: Schema.Literal("days"),
    days: Schema.Array(DayOfWeek).pipe(
      Schema.filter((days) => new Set(days).size === days.length || "Each day can appear once"),
      Schema.filter((days) => days.length > 0 || "A weekend needs at least one day"),
      Schema.filter((days) =>
        days.length < daysOfWeek.length || "The week needs at least one workday"
      ),
    ),
  }),
  Schema.Struct({ is: Schema.Literal("none") }),
);
export type Weekend = typeof Weekend.Type;

export const defaultWeekend: Weekend = { is: "days", days: ["saturday", "sunday"] };

/**
 * When the user's day starts and ends, and which days are their weekend. Between
 * the start and end (on any day of the week) it's day; otherwise night. On other
 * days than the weekend's, the same span is the workday. The day must start
 * before it ends: it can't run past midnight. Schedules saved before the weekend
 * was settable decode with Saturday and Sunday.
 */
export const Schedule = Schema.Struct({
  startOfDay: TimeOfDay,
  endOfDay: TimeOfDay,
  weekend: Schema.optionalWith(Weekend, { default: () => defaultWeekend }),
}).pipe(
  Schema.filter((s) => s.startOfDay < s.endOfDay || "The day must start before it ends"),
);
export type Schedule = typeof Schedule.Type;

export const defaultSchedule: Schedule = {
  startOfDay: "09:00",
  endOfDay: "17:00",
  weekend: defaultWeekend,
};

const minutesOf = (time: TimeOfDay): { hours: number; minutes: number } => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return { hours, minutes };
};

/** `time` on the calendar day `days` after `day`'s (DST-safe: built from local fields). */
const onDay = (day: Date, days: number, time: TimeOfDay): Date => {
  const { hours, minutes } = minutesOf(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days, hours, minutes);
};

/** Whether `date` falls on a workday: any day outside the weekend. */
const isWorkday = (date: Date, weekend: Weekend): boolean =>
  weekend.is === "none" || !weekend.days.some((day) => daysOfWeek.indexOf(day) === date.getDay());

/** The page's look: day, or night (from the end of one day until the start of the next). */
export type Phase = "day" | "night";

export const phaseAt = (now: Date, schedule: Schedule): Phase =>
  onDay(now, 0, schedule.startOfDay) <= now && now < onDay(now, 0, schedule.endOfDay)
    ? "day"
    : "night";

/**
 * Where `now` falls in the working week: within a workday's day ("workday"),
 * between two successive workdays' days ("after-hours"), or between the end of
 * the last workday before a weekend and the start of the first after it
 * ("weekend"). With no set weekend, every day is a workday, so it's never the
 * weekend. Each spans `start` to `end`; `progress` is how far
 * through it `now` is, from 0 to 1.
 */
export type Workday = {
  readonly is: "workday" | "after-hours" | "weekend";
  readonly start: Date;
  readonly end: Date;
  readonly progress: number;
};

/** Looks at most a week either way, which always finds a workday. */
const searchDays = 7;

/** The first workday's `time` at or after (`direction` 1) or at or before (-1) `now`. */
const nearestWorkdayAt = (
  now: Date,
  time: TimeOfDay,
  weekend: Weekend,
  direction: 1 | -1,
  inclusive: boolean,
): Date => {
  for (let days = 0; days <= searchDays; days++) {
    const candidate = onDay(now, days * direction, time);
    const diff = (candidate.getTime() - now.getTime()) * direction;
    if (isWorkday(candidate, weekend) && (diff > 0 || (inclusive && diff === 0))) {
      return candidate;
    }
  }
  throw new Error("Unreachable: every week has a workday");
};

const progressOf = (now: Date, start: Date, end: Date): number =>
  Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));

export const workdayAt = (now: Date, schedule: Schedule): Workday => {
  const start = onDay(now, 0, schedule.startOfDay);
  const end = onDay(now, 0, schedule.endOfDay);
  const { weekend } = schedule;
  if (isWorkday(now, weekend) && start <= now && now < end) {
    return { is: "workday", start, end, progress: progressOf(now, start, end) };
  }
  const lastEnd = nearestWorkdayAt(now, schedule.endOfDay, weekend, -1, true);
  const nextStart = nearestWorkdayAt(now, schedule.startOfDay, weekend, 1, false);
  // Successive workdays are on consecutive days, unless there's a weekend between.
  const consecutive = nextStart.getTime() === onDay(lastEnd, 1, schedule.startOfDay).getTime();
  return {
    is: consecutive ? "after-hours" : "weekend",
    start: lastEnd,
    end: nextStart,
    progress: progressOf(now, lastEnd, nextStart),
  };
};

/**
 * The next moment after `now` that the phase or the workday state changes: the
 * next start or end of day. Set a timer for it to keep either up to date.
 */
export const nextChange = (now: Date, schedule: Schedule): Date => {
  const candidates = [
    onDay(now, 0, schedule.startOfDay),
    onDay(now, 0, schedule.endOfDay),
    onDay(now, 1, schedule.startOfDay),
  ];
  // Tomorrow's start is always after now, so there's always one.
  return candidates.find((c) => c > now) ?? onDay(now, 1, schedule.startOfDay);
};

/** Milliseconds until the next minute starts, e.g. to update a clock. */
export const untilNextMinute = (now: Date): number => 60_000 - (now.getTime() % 60_000);
