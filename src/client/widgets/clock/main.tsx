/** The clock widget: the current time and date, updated each minute. */
import { Either } from "effect";
import { useEffect, useState } from "react";
import { registerMfe, type ViewProps } from "../../mfe/register-live.tsx";
import { decodeConfig, formatClock, untilNextMinute } from "./clock.ts";

/** The current time, updated as each minute starts. */
const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), untilNextMinute(now));
    return () => clearTimeout(timer);
  }, [now]);
  return now;
};

function Clock({ props }: ViewProps) {
  const now = useNow();
  const face = Either.flatMap(
    decodeConfig(props),
    (config) => formatClock(now, config.timeZone, undefined),
  );
  if (Either.isLeft(face)) {
    return <p style={{ margin: 0, opacity: 0.8 }}>{face.left}</p>;
  }
  const { time, date, zone } = face.right;
  // Colors and fonts are inherited from the column the widget sits in.
  return (
    <div title={zone} style={{ lineHeight: 1.1 }}>
      <div style={{ fontSize: "2.5em", fontVariantNumeric: "tabular-nums" }}>{time}</div>
      <div style={{ opacity: 0.75 }}>{date}</div>
    </div>
  );
}

registerMfe("clock", () => ({ widget: Clock }));
