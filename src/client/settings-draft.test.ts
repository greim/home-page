import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import { defaultSchedule, Schedule } from "../common/day-cycle.ts";
import {
  dialogWeek,
  finishSettingsDraft,
  type SettingsDraft,
  toggleWeekendDay,
  toSettingsDraft,
} from "./settings-draft.ts";

const draft = toSettingsDraft(defaultSchedule);

Deno.test("The dialog's week runs Monday to Sunday", () => {
  assertEquals(dialogWeek.at(0), "monday");
  assertEquals(dialogWeek.at(-1), "sunday");
  assertEquals(dialogWeek.length, 7);
});

Deno.test("A draft starts from the schedule, its weekend in the dialog's order", () => {
  assertEquals(draft, {
    startOfDay: "09:00",
    endOfDay: "17:00",
    hasWeekend: true,
    weekendDays: ["saturday", "sunday"],
  });
  assertEquals(
    toSettingsDraft({ ...defaultSchedule, weekend: { is: "none" } }),
    { ...draft, hasWeekend: false, weekendDays: [] },
  );
});

Deno.test("toggleWeekendDay adds a day in order, or takes it out", () => {
  assertEquals(toggleWeekendDay(draft, "friday").weekendDays, ["friday", "saturday", "sunday"]);
  assertEquals(toggleWeekendDay(draft, "saturday").weekendDays, ["sunday"]);
});

Deno.test("An unchanged draft finishes as the schedule it came from", () => {
  assertEquals(finishSettingsDraft(draft), { ok: true, schedule: defaultSchedule });
});

Deno.test("No set weekend saves without days, whichever were chosen", () => {
  assertEquals(
    finishSettingsDraft({ ...draft, hasWeekend: false }),
    { ok: true, schedule: { ...defaultSchedule, weekend: { is: "none" } } },
  );
  assertEquals(
    finishSettingsDraft({ ...draft, hasWeekend: false, weekendDays: [] }).ok,
    true,
  );
});

Deno.test("finishSettingsDraft explains what to fix", () => {
  const problems: ReadonlyArray<SettingsDraft> = [
    { ...draft, startOfDay: "" },
    { ...draft, endOfDay: "" },
    { ...draft, startOfDay: "17:00", endOfDay: "09:00" },
    { ...draft, endOfDay: "09:00" },
    { ...draft, weekendDays: [] },
    { ...draft, weekendDays: dialogWeek },
  ];
  for (const problem of problems) {
    assertEquals(finishSettingsDraft(problem).ok, false, JSON.stringify(problem));
  }
});

Deno.test("Every finished schedule is one the layout accepts", () => {
  const drafts: ReadonlyArray<SettingsDraft> = [
    draft,
    { ...draft, hasWeekend: false },
    { ...draft, startOfDay: "06:30", endOfDay: "14:45", weekendDays: ["wednesday"] },
  ];
  for (const d of drafts) {
    const finished = finishSettingsDraft(d);
    if (!finished.ok) throw new Error(finished.errorMessage);
    assertEquals(
      Schema.decodeUnknownEither(Schedule)(finished.schedule),
      Either.right(finished.schedule),
    );
  }
});
