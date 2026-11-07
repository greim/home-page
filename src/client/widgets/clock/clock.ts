/** The clock widget's logic: formatting the local date and time. */

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * The parts of the clock's face, in the computer's local time, shown with "/"
 * between them: `YYYY / MMM / D / h:mm a`, e.g. 2026 / Nov / 6 / 3:28 pm.
 */
export const clockParts = (now: Date): ReadonlyArray<string> => {
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return [
    String(now.getFullYear()),
    months.at(now.getMonth()) ?? "",
    String(now.getDate()),
    `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "am" : "pm"}`,
  ];
};
