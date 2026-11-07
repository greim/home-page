/**
 * The workday widget: a progress bar through the working week, following the
 * user's schedule (see day-cycle.ts). It's headed by the part of the week it is
 * (Workday, After Hours or Weekend), and fills with rolling stripes. When one
 * part ends and the next begins, the bar slides back to empty.
 */
import { chakra, Text } from "@chakra-ui/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuBed, LuHardHat, LuPartyPopper } from "react-icons/lu";
import type { Workday as WorkdayState } from "../../../common/day-cycle.ts";
import { workdayAt } from "../../../common/day-cycle.ts";
import { registerMfe } from "../../mfe/register-live.tsx";
import { hatching, widgetHeading } from "../../surface.ts";
import { useNow } from "../../widget-kit/now.ts";
import {
  type EditorProps,
  editorView,
  type WidgetProps,
  widgetView,
} from "../../widget-kit/views.tsx";
import { WorkdayConfig } from "./config.ts";
import { labelRight, percent, workdayTitle } from "./workday.ts";

/** The icon beside each part of the week's heading. */
const workdayIcon = (is: WorkdayState["is"]): ReactNode => {
  switch (is) {
    case "workday":
      return <LuHardHat />;
    case "after-hours":
      return <LuBed />;
    case "weekend":
      return <LuPartyPopper />;
    default:
      return is satisfies never;
  }
};

/** How long the bar takes to grow, or to slide back to empty when the part of the week changes. */
const fillTransition = "2s ease-in-out";

/** Diagonal stripes, one tile of which repeats; the animation rolls them one tile along. */
const stripeTile = "2rem";
const stripes =
  "linear-gradient(45deg, rgba(0, 0, 0, 0.18) 25%, transparent 25%, transparent 50%, rgba(0, 0, 0, 0.18) 50%, rgba(0, 0, 0, 0.18) 75%, transparent 75%, transparent)";
const rollKeyframes =
  `@keyframes workday-roll { from { background-position: ${stripeTile} 0; } to { background-position: 0 0; } }`;

/** The width of the bar and of its label, in pixels, once laid out; null until then. */
const useWidths = () => {
  const track = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<{ track: number; label: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (track.current === null || label.current === null) return;
      setWidths({ track: track.current.clientWidth, label: label.current.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (track.current !== null) observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  return { track, label, widths };
};

function Workday({ schedule }: WidgetProps<WorkdayConfig>) {
  const now = useNow();
  const workday = workdayAt(now, schedule);
  const done = percent(workday.progress);
  const { track, label, widths } = useWidths();
  // Rem-based, so they scale with the page; measured as pixels for the label's place.
  const em = label.current === null ? 0 : parseFloat(getComputedStyle(label.current).fontSize);
  const right = widths === null ? 0 : labelRight({
    progress: done / 100,
    track: widths.track,
    label: widths.label,
    inset: 0.9 * em,
    gap: 0.5 * em,
  });

  return (
    <>
      <style>{rollKeyframes}</style>
      <chakra.h3
        {...widgetHeading}
        // A little closer to its bar than other widgets' headings are to their content.
        mb="0.6rem"
        display="flex"
        alignItems="center"
        gap="0.5em"
      >
        <chakra.span display="inline-flex" flexShrink={0} aria-hidden>
          {workdayIcon(workday.is)}
        </chakra.span>
        {workdayTitle(workday.is)}
      </chakra.h3>
      <chakra.div
        ref={track}
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={workdayTitle(workday.is)}
        position="relative"
        overflow="hidden"
        borderRadius="1em"
        mx="-0.2em"
        h="2em"
        bgColor="rgba(56, 56, 56, 0.5)"
        {...hatching}
        boxShadow="-1px -1px 0 rgba(0, 0, 0, 0.5), 1px 1px 0 rgba(255, 255, 255, 0.35), 0.1em 0.1em 0.2em rgba(0, 0, 0, 0.15) inset"
      >
        <chakra.div
          position="absolute"
          inset="0"
          right="auto"
          w={`${done}%`}
          transition={`width ${fillTransition}`}
          bgColor="oklch(0.72 0.13 105)"
          bgImage="linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(0, 0, 0, 0.1) 100%)"
          boxShadow="-1px 0 rgba(0, 0, 0, 0.5) inset, 0.03em 0.03em 0.1em rgba(0, 0, 0, 0.3)"
          _after={{
            content: `""`,
            position: "absolute",
            inset: "0",
            bgImage: stripes,
            bgSize: `${stripeTile} ${stripeTile}`,
            animation: "workday-roll 1s linear infinite",
          }}
          _motionReduce={{ transition: "none", _after: { animation: "none" } }}
        />
        <chakra.span
          ref={label}
          position="absolute"
          top="50%"
          right={`${right}px`}
          transform="translateY(-50%)"
          transition={`right ${fillTransition}`}
          _motionReduce={{ transition: "none" }}
          fontSize="80%"
          lineHeight="1"
          fontVariantNumeric="tabular-nums"
          // Hidden until placed, so it doesn't flash at the wrong end.
          visibility={widths === null ? "hidden" : "visible"}
        >
          {done}%
        </chakra.span>
      </chakra.div>
    </>
  );
}

function WorkdayEditor({ config, reportDraft }: EditorProps<WorkdayConfig>) {
  useEffect(() => reportDraft({ ok: true, config }), []);
  return (
    <Text fontSize="sm" color="fg.muted">
      Shows how far through the workday, the hours after it, or the weekend it is. It follows when
      your day starts and ends, a setting of the whole page.
    </Text>
  );
}

registerMfe("workday", () => ({
  widget: widgetView(WorkdayConfig, Workday),
  editor: editorView(WorkdayConfig, WorkdayEditor),
}));
