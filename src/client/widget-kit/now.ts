/** The current time, for widgets that show it or follow it. */
import { useEffect, useState } from "react";
import { untilNextMinute } from "../../common/day-cycle.ts";

/**
 * The current time, updated as each minute starts. Times of day in the user's
 * schedule are whole minutes, so this also catches the start and end of day.
 */
export const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), untilNextMinute(now));
    return () => clearTimeout(timer);
  }, [now]);
  return now;
};
