/**
 * The clock widget: the local date and time, updated each minute, after a sun
 * during the user's day or a moon outside it (see day-cycle.ts).
 */
import { chakra, Text } from "@chakra-ui/react";
import { useEffect } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { phaseAt } from "../../../common/day-cycle.ts";
import { registerMfe } from "../../mfe/register-live.tsx";
import {
  type EditorProps,
  editorView,
  type WidgetProps,
  widgetView,
} from "../../widget-kit/views.tsx";
import { useNow } from "../../widget-kit/now.ts";
import { clockParts } from "./clock.ts";
import { ClockConfig } from "./config.ts";

/** Faded slashes between the parts of the date and time. */
const separated = {
  "& > span + span::before": { content: `"/"`, mx: "0.4em", opacity: 0.4 },
} as const;

function Clock({ schedule }: WidgetProps<ClockConfig>) {
  const now = useNow();
  const day = phaseAt(now, schedule) === "day";
  // Colors and fonts are inherited from the column the widget sits in.
  return (
    <chakra.div
      display="flex"
      alignItems="center"
      gap="0.6em"
      // Sized to fit "2026 / Nov / 30 / 10:59 pm" on one line in a column.
      fontSize="1.25rem"
      lineHeight="1.2"
      whiteSpace="nowrap"
      fontVariantNumeric="tabular-nums"
    >
      <chakra.span
        display="inline-flex"
        flexShrink={0}
        color={day ? "#ffd84d" : "#fff1b0"}
        title={day ? "Day" : "Night"}
        aria-label={day ? "Day" : "Night"}
        // Filled: a solid sun disc and crescent moon, as in the reference.
        css={{ "& svg": { fill: "currentColor" } }}
      >
        {day ? <LuSun /> : <LuMoon />}
      </chakra.span>
      <chakra.span css={separated}>
        {clockParts(now).map((part, i) => <span key={i}>{part}</span>)}
      </chakra.span>
    </chakra.div>
  );
}

function ClockEditor({ config, reportDraft }: EditorProps<ClockConfig>) {
  useEffect(() => reportDraft({ ok: true, config }), []);
  return (
    <Text fontSize="sm" color="fg.muted">
      Shows the computer's local date and time. A sun shows during your day, and a moon outside it;
      when your day starts and ends is a setting of the whole page.
    </Text>
  );
}

registerMfe("clock", () => ({
  widget: widgetView(ClockConfig, Clock),
  editor: editorView(ClockConfig, ClockEditor),
}));
