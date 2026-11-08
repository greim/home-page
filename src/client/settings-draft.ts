/**
 * The settings dialog's logic: the schedule being edited, and checking it before
 * it's saved. The draft keeps the chosen weekend days while "no set weekend" is
 * on, so turning it off again brings them back.
 */
import { type DayOfWeek, daysOfWeek, type Schedule } from "../common/day-cycle.ts";

export type SettingsDraft = {
  /** As a time input gives it: `HH:MM`, or empty when cleared. */
  readonly startOfDay: string;
  readonly endOfDay: string;
  /** False when the user has no set weekend: then every day is a workday. */
  readonly hasWeekend: boolean;
  readonly weekendDays: ReadonlyArray<DayOfWeek>;
};

/** The week as the dialog lists it, Monday first, so a Saturday and Sunday weekend ends it. */
export const dialogWeek: ReadonlyArray<DayOfWeek> = [...daysOfWeek.slice(1), "sunday"];

/** The days in the dialog's order, whatever order they were chosen in. */
const inWeekOrder = (days: ReadonlyArray<DayOfWeek>): ReadonlyArray<DayOfWeek> =>
  dialogWeek.filter((day) => days.includes(day));

export const toSettingsDraft = (schedule: Schedule): SettingsDraft => ({
  startOfDay: schedule.startOfDay,
  endOfDay: schedule.endOfDay,
  hasWeekend: schedule.weekend.is === "days",
  weekendDays: schedule.weekend.is === "days" ? inWeekOrder(schedule.weekend.days) : [],
});

/** Adds the day to the weekend, or takes it out. */
export const toggleWeekendDay = (draft: SettingsDraft, day: DayOfWeek): SettingsDraft => ({
  ...draft,
  weekendDays: draft.weekendDays.includes(day)
    ? draft.weekendDays.filter((d) => d !== day)
    : inWeekOrder([...draft.weekendDays, day]),
});

export type FinishedSettings =
  | { readonly ok: true; readonly schedule: Schedule }
  | { readonly ok: false; readonly errorMessage: string };

const isTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** The schedule to save, or what to fix first. */
export const finishSettingsDraft = (draft: SettingsDraft): FinishedSettings => {
  if (!isTime(draft.startOfDay)) return { ok: false, errorMessage: "Choose when your day starts." };
  if (!isTime(draft.endOfDay)) return { ok: false, errorMessage: "Choose when your day ends." };
  if (draft.startOfDay >= draft.endOfDay) {
    return { ok: false, errorMessage: "Your day needs to end after it starts, on the same day." };
  }
  if (!draft.hasWeekend) {
    return {
      ok: true,
      schedule: { startOfDay: draft.startOfDay, endOfDay: draft.endOfDay, weekend: { is: "none" } },
    };
  }
  if (draft.weekendDays.length === 0) {
    return {
      ok: false,
      errorMessage: "Pick at least one weekend day, or choose “No set weekend”.",
    };
  }
  if (draft.weekendDays.length === daysOfWeek.length) {
    return { ok: false, errorMessage: "Leave at least one workday in the week." };
  }
  return {
    ok: true,
    schedule: {
      startOfDay: draft.startOfDay,
      endOfDay: draft.endOfDay,
      weekend: { is: "days", days: draft.weekendDays },
    },
  };
};
