/**
 * The visualizer's card: a box to paste a data dump into. On a paste, its agent works
 * out a chart (the box shows it thinking), then the box shows the chart, with buttons
 * to clear it and open it full screen, where past charts can be browsed and refined.
 */
import { Box, chakra, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { type ClipboardEvent, type ReactNode, useState } from "react";
import { LuMaximize2, LuSquare } from "react-icons/lu";
import { codeTextShadow, widgetHeading } from "../../surface.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import { ChartSvg } from "./chart-view.tsx";
import { type Chart, latest, newChart, tooBig } from "./charts.ts";
import type { VisualizerConfig } from "./config.ts";
import { type Clip, readDump } from "./data.ts";
import { palette } from "./palette.ts";
import {
  deleteChart,
  putChart,
  showInCard,
  useCharts,
  useShownInCard,
  useWorking,
} from "./store-live.ts";
import { useVisualize } from "./visualize-live.ts";

/** The box's height: a column chart's shape (408 × 260) at the column's width. */
const boxAspect = "408 / 260";

/** The cells of the first table in some HTML, if it has one. */
const firstTable = (html: string): ReadonlyArray<ReadonlyArray<string>> | null => {
  if (html === "") return null;
  const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
  if (table === null) return null;
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.innerText ?? ""))
    .filter((row) => row.length > 0);
};

const clipOf = (event: ClipboardEvent): Clip => {
  const data = event.clipboardData;
  return {
    types: Array.from(data.types),
    table: firstTable(data.getData("text/html")),
    text: data.getData("text/plain"),
  };
};

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
  const chart = chosen === undefined
    ? charts.at(0) ?? null
    : charts.find((c) => c.id === chosen) ?? null;
  const progress = chart === null ? undefined : working.get(chart.id);
  const version = chart === null ? null : latest(chart);

  const paste = (event: ClipboardEvent) => {
    event.preventDefault();
    const dump = readDump(clipOf(event));
    if (dump === null) return;
    const problem = tooBig(dump);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const created = newChart(crypto.randomUUID(), widgetId, dump, Date.now());
    putChart(created);
    showInCard(widgetId, created.id);
    agent.visualize(created, "");
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
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Box position="relative">
        {chart === null
          ? (
            <TextBox
              resize="none"
              minH="0"
              aspectRatio={boxAspect}
              textShadow={codeTextShadow}
              spellCheck={false}
              value=""
              onChange={() => {}}
              onDrop={(e) => e.preventDefault()}
              placeholder="Paste data to chart: JSON, CSV, a table from a page or spreadsheet"
              aria-label="Paste data here"
              readOnly={error !== null}
              onPaste={paste}
            />
          )
          : version !== null && progress === undefined
          ? (
            <ChartSvg
              svg={version.columnSvg}
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
      </Box>
      {chart !== null && (
        <Text fontSize="0.8rem" mt="0.4rem" lineClamp={1} title={chart.title}>
          {progress !== undefined && version === null ? "Charting…" : chart.title}
        </Text>
      )}
      <HStack mt="0.6rem" gap="0.5rem">
        <TextBoxButton disabled={chart === null} onClick={clear}>Clear</TextBoxButton>
        <TextBoxButton ms="auto" disabled={charts.length === 0} onClick={openFullScreen}>
          <LuMaximize2 /> {charts.length > 1 ? `All charts (${charts.length})` : "Full screen"}
        </TextBoxButton>
      </HStack>
    </>
  );
}
