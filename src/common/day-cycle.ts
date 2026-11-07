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

/**
 * When the user's day starts and ends. Between the two (on any day of the week)
 * it's day; otherwise night. On weekdays, the same span is the workday. The day
 * must start before it ends: it can't run past midnight.
 */
export const Schedule = Schema.Struct({
  startOfDay: TimeOfDay,
  endOfDay: TimeOfDay,
}).pipe(
  Schema.filter((s) => s.startOfDay < s.endOfDay || "The day must start before it ends"),
);
export type Schedule = typeof Schedule.Type;

export const defaultSchedule: Schedule = { startOfDay: "09:00", endOfDay: "17:00" };

const minutesOf = (time: TimeOfDay): { hours: number; minutes: number } => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return { hours, minutes };
};

/** `time` on the calendar day `days` after `day`'s (DST-safe: built from local fields). */
const onDay = (day: Date, days: number, time: TimeOfDay): Date => {
  const { hours, minutes } = minutesOf(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days, hours, minutes);
};

/** Monday through Friday. */
const isWeekday = (date: Date): boolean => date.getDay() >= 1 && date.getDay() <= 5;

/** The page's look: day, or night (from the end of one day until the start of the next). */
export type Phase = "day" | "night";

export const phaseAt = (now: Date, schedule: Schedule): Phase =>
  onDay(now, 0, schedule.startOfDay) <= now && now < onDay(now, 0, schedule.endOfDay)
    ? "day"
    : "night";

/**
 * Where `now` falls in the working week: within a weekday's day ("workday"),
 * between two weekdays' days ("after-hours"), or between Friday's end of day and
 * Monday's start ("weekend"). Each spans `start` to `end`; `progress` is how far
 * through it `now` is, from 0 to 1.
 */
export type Workday = {
  readonly is: "workday" | "after-hours" | "weekend";
  readonly start: Date;
  readonly end: Date;
  readonly progress: number;
};

/** Looks at most a week either way, which always finds a weekday. */
const searchDays = 7;

/** The first weekday `time` at or after (`direction` 1) or at or before (-1) `now`. */
const nearestWeekdayAt = (
  now: Date,
  time: TimeOfDay,
  direction: 1 | -1,
  inclusive: boolean,
): Date => {
  for (let days = 0; days <= searchDays; days++) {
    const candidate = onDay(now, days * direction, time);
    const diff = (candidate.getTime() - now.getTime()) * direction;
    if (isWeekday(candidate) && (diff > 0 || (inclusive && diff === 0))) {
      return candidate;
    }
  }
  throw new Error("Unreachable: every week has a weekday");
};

const progressOf = (now: Date, start: Date, end: Date): number =>
  Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));

export const workdayAt = (now: Date, schedule: Schedule): Workday => {
  const start = onDay(now, 0, schedule.startOfDay);
  const end = onDay(now, 0, schedule.endOfDay);
  if (isWeekday(now) && start <= now && now < end) {
    return { is: "workday", start, end, progress: progressOf(now, start, end) };
  }
  const lastEnd = nearestWeekdayAt(now, schedule.endOfDay, -1, true);
  const nextStart = nearestWeekdayAt(now, schedule.startOfDay, 1, false);
  return {
    // Weekdays are consecutive except across a weekend, which always follows Friday.
    is: lastEnd.getDay() === 5 ? "weekend" : "after-hours",
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
