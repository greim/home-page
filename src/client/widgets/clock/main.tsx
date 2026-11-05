/** The clock widget: the current time and date, updated each minute. */
import { NativeSelect } from "@chakra-ui/react";
import { Either } from "effect";
import { useEffect, useState } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import {
  type EditorProps,
  editorView,
  type WidgetProps,
  widgetView,
} from "../../widget-kit/views.tsx";
import { formatClock, timeZones, untilNextMinute } from "./clock.ts";
import { ClockConfig } from "./config.ts";

/** The current time, updated as each minute starts. */
const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), untilNextMinute(now));
    return () => clearTimeout(timer);
  }, [now]);
  return now;
};

function Clock({ config }: WidgetProps<ClockConfig>) {
  const now = useNow();
  const face = formatClock(now, config.timeZone, undefined);
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

const local = "";

function ClockEditor({ config, reportDraft }: EditorProps<ClockConfig>) {
  const [timeZone, setTimeZone] = useState(config.timeZone);
  useEffect(() => reportDraft({ ok: true, config }), []);
  return (
    <>
      <Label>Time zone</Label>
      <NativeSelect.Root size="sm" width="72">
        <NativeSelect.Field
          value={timeZone ?? local}
          onChange={(e) => {
            const next = e.target.value === local ? null : e.target.value;
            setTimeZone(next);
            reportDraft({ ok: true, config: { timeZone: next } });
          }}
        >
          <option value={local}>The computer's own</option>
          {timeZones().map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </>
  );
}

registerMfe("clock", () => ({
  widget: widgetView(ClockConfig, Clock),
  editor: editorView(ClockConfig, ClockEditor),
}));
