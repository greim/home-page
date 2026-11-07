/** Whether the page is in day or night mode, kept up to date as the user's day starts and ends. */
import { useEffect, useState } from "react";
import { nextChange, type Phase, phaseAt, type Schedule } from "../common/day-cycle.ts";

/**
 * Day or night now, by the user's schedule. It's worked out as the page renders,
 * so a page opened at night starts in night mode. A timer re-renders the page
 * at the next start or end of day, and so does the tab coming back into view
 * (timers can run late while a computer sleeps).
 */
export const useDayPhase = (schedule: Schedule): Phase => {
  const [, setTick] = useState(0);
  const now = new Date();
  const wait = nextChange(now, schedule).getTime() - now.getTime();
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    const timer = setTimeout(rerender, wait);
    const onVisible = () => document.visibilityState === "visible" && rerender();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
  return phaseAt(now, schedule);
};
