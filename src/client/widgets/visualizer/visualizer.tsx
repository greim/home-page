/**
 * The visualizer's card: a box to paste a data dump into, or type it (or describe it)
 * with a request. On a paste into the empty box, or Chart it, its agent works out a chart (the box shows it thinking), then the box shows the chart, with buttons
 * to clear it and open it full screen, where past charts can be browsed and refined.
 */
import { Box, chakra, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { type ClipboardEvent, type ReactNode, useState } from "react";
import { LuChartBarStacked, LuChevronDown, LuMaximize2, LuSend, LuSquare } from "react-icons/lu";
import { codeTextShadow, widgetHeading } from "../../surface.ts";
import { useBoxHeight } from "../../widget-kit/box-height.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import { ChartSvg } from "./chart-view.tsx";
import { type Chart, latest, newChart, tooBig } from "./charts.ts";
import type { VisualizerConfig } from "./config.ts";
import { CopyFlash, CopyMenu, useCopy } from "./copy-menu.tsx";
import { type Clip, type Dump, readDump, readTyped } from "./data.ts";
import { palette } from "./palette.ts";
import { chartAspect } from "./spec.ts";
import {
  deleteChart,
  putChart,
  showInCard,
  useCharts,
  useShownInCard,
  useWorking,
} from "./store-live.ts";
import { useVisualize } from "./visualize-live.ts";

/** The box's height: a column chart's shape at the column's width. */
const boxAspect = chartAspect;

/** The cells of the first table in some HTML, if it has one. */
const firstTable = (html: string): ReadonlyArray<ReadonlyArray<string>> | null => {
  if (html === "") return null;
  const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
  if (table === null) return null;
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.innerText ?? ""))
    .filter((row) => row.length > 0);
};

/** What's on the clipboard, and the image file on it, if any. */
const clipOf = (event: ClipboardEvent): { clip: Clip; image: File | null } => {
  const data = event.clipboardData;
  const image = Array.from(data.items)
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile() ?? null;
  return {
    clip: {
      types: Array.from(data.types),
      table: firstTable(data.getData("text/html")),
      text: data.getData("text/plain"),
      imageType: image?.type ?? null,
    },
    image,
  };
};

const unsupported = "That can't be charted. Paste data as text or a table, or an image of " +
  "it (PNG, JPEG, GIF or WebP).";

/** A message (and buttons) in the middle of the box. */
function Overlay(props: { children: ReactNode }) {
  return (
    <Stack
      position="absolute"
      inset="0"
      align="center"
      justify="center"
      gap="0.5rem"
      p="0.8rem"
      textAlign="center"
      fontSize="0.8rem"
      textShadow={codeTextShadow}
    >
      {props.children}
    </Stack>
  );
}

const lastNote = (chart: Chart): string =>
  chart.entries.at(-1)?.text ?? "It couldn't make a chart of that.";

export function Visualizer({ config, widgetId, openFullScreen }: WidgetProps<VisualizerConfig>) {
  const heading = config.heading.trim();
  const charts = useCharts(widgetId);
  const chosen = useShownInCard(widgetId);
  const working = useWorking();
  const agent = useVisualize();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const box = useBoxHeight(widgetId);
  const chart = chosen === undefined
    ? charts.at(0) ?? null
    : charts.find((c) => c.id === chosen) ?? null;
  const progress = chart === null ? undefined : working.get(chart.id);
  const version = chart === null ? null : latest(chart);
  const { flash, copy } = useCopy(chart, version);

  const start = (dump: Dump, original: string, request: string, image: Blob | null = null) => {
    const problem = tooBig(dump, original, image);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const created = newChart({
      id: crypto.randomUUID(),
      widgetId,
      data: dump,
      original,
      image,
      now: Date.now(),
    });
    putChart(created);
    showInCard(widgetId, created.id);
    setDraft("");
    agent.visualize(created, request);
  };

  // A paste into the empty box is charted at once. Into text already typed, it's just
  // pasted, to chart with the rest; unless it's an image, which is charted at once, with
  // what's typed as the request.
  const paste = (event: ClipboardEvent) => {
    const { clip, image } = clipOf(event);
    const typed = draft.trim();
    if (typed !== "") {
      const dump = clip.text.trim() === "" ? readDump(clip) : null;
      if (dump?.is !== "image") return;
      event.preventDefault();
      start(dump, "", typed, image);
      return;
    }
    event.preventDefault();
    const dump = readDump(clip);
    if (dump === null) {
      if (clip.types.length > 0) setError(unsupported);
      return;
    }
    start(dump, dump.is === "image" ? "" : clip.text, "", dump.is === "image" ? image : null);
  };

  const chartTyped = () => {
    const typed = readTyped(draft);
    if (typed !== null) start(typed.dump, typed.original, typed.request);
  };

  const clear = () => {
    // A chart that never came to anything isn't worth keeping.
    if (chart !== null && chart.versions.length === 0 && progress === undefined) {
      deleteChart(chart.id);
    }
    showInCard(widgetId, null);
  };

  return (
    <>
      {heading !== "" && (
        <chakra.h3 {...widgetHeading} display="flex" alignItems="center" gap="0.5rem">
          <LuChartBarStacked aria-hidden />
          {heading}
        </chakra.h3>
      )}
      <Box position="relative">
        {chart === null
          ? (
            <TextBox
              minH="5rem"
              {...box}
              textShadow={codeTextShadow}
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  chartTyped();
                }
              }}
              placeholder={"Type or paste JSON, CSV, or a table from a page or spreadsheet, " +
                "or a screenshot of one, or a description along with the data."}
              aria-label="Data to chart"
              readOnly={error !== null}
              onPaste={paste}
            />
          )
          : version !== null && progress === undefined
          ? (
            <ChartSvg
              svg={version.svg}
              label={chart.title}
              aspectRatio={boxAspect}
              borderRadius="0.2125rem"
              cursor="zoom-in"
              onClick={openFullScreen}
            />
          )
          : (
            <Box aspectRatio={boxAspect} bg={palette.surface} borderRadius="0.2125rem">
              {progress !== undefined
                ? (
                  <Overlay>
                    <Spinner size="sm" />
                    <Text lineClamp={2}>{progress}</Text>
                    {agent.busy && (
                      <TextBoxButton size="xs" onClick={agent.cancel}>
                        <LuSquare /> Stop
                      </TextBoxButton>
                    )}
                  </Overlay>
                )
                : (
                  <Overlay>
                    <Text lineClamp={4}>{lastNote(chart)}</Text>
                  </Overlay>
                )}
            </Box>
          )}
        {chart === null && error !== null && (
          <Overlay>
            <Text>{error}</Text>
            <TextBoxButton size="xs" onClick={() => setError(null)}>OK</TextBoxButton>
          </Overlay>
        )}
        <CopyFlash flash={flash} />
      </Box>
      {chart !== null && (
        <Text fontSize="0.8rem" mt="0.4rem" lineClamp={1} title={chart.title}>
          {progress !== undefined && version === null ? "Charting…" : chart.title}
        </Text>
      )}
      <HStack mt="0.6rem" gap="0.5rem">
        <TextBoxButton
          disabled={chart === null && draft === ""}
          onClick={chart === null ? () => setDraft("") : clear}
        >
          Clear
        </TextBoxButton>
        {chart === null
          ? (
            <TextBoxButton
              aria-label="Chart it"
              disabled={draft.trim() === ""}
              onClick={chartTyped}
            >
              <LuSend />
            </TextBoxButton>
          )
          : (
            <CopyMenu
              portalled
              onCopy={copy}
              trigger={
                <TextBoxButton disabled={version === null}>
                  Copy as <LuChevronDown />
                </TextBoxButton>
              }
            />
          )}
        <TextBoxButton ms="auto" disabled={charts.length === 0} onClick={openFullScreen}>
          <LuMaximize2 /> {charts.length > 1 ? `All charts (${charts.length})` : "Full screen"}
        </TextBoxButton>
      </HStack>
    </>
  );
}
