/**
 * The visualizer's full-screen view: past charts down the left (to pick or delete),
 * the chosen chart large in the middle (with its earlier versions), and a chat on the
 * right to refine it with the agent.
 */
import { MarkdownText } from "../../widget-kit/markdown-text.tsx";
import {
  Box,
  Button,
  chakra,
  HStack,
  IconButton,
  Spinner,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuSend, LuTrash2 } from "react-icons/lu";
import { type FullScreenProps, useColumnsPerView } from "../../widget-kit/views.tsx";
import { ChartSvg } from "./chart-view.tsx";
import { type Chart, describeData, type Entry, latest } from "./charts.ts";
import type { VisualizerConfig } from "./config.ts";
import { CopyFlash, CopyMenu, useCopy } from "./copy-menu.tsx";
import { palette } from "./palette.ts";
import { chartAspect } from "./spec.ts";
import { deleteChart, showInCard, useCharts, useShownInCard, useWorking } from "./store-live.ts";
import { useVisualize } from "./visualize-live.ts";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function ChartListItem(props: {
  chart: Chart;
  selected: boolean;
  working: boolean;
  onSelect: () => void;
}) {
  const { chart } = props;
  const [confirming, setConfirming] = useState(false);
  const version = latest(chart);
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-current={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") props.onSelect();
      }}
      onMouseLeave={() => setConfirming(false)}
      p="2"
      rounded="md"
      cursor="pointer"
      bg={props.selected ? "bg.emphasized" : undefined}
      _hover={{ bg: props.selected ? "bg.emphasized" : "bg.muted" }}
    >
      {version !== null
        ? (
          <ChartSvg
            svg={version.svg}
            label={chart.title}
            aspectRatio={chartAspect}
            rounded="sm"
          />
        )
        : (
          <Box
            aspectRatio={chartAspect}
            rounded="sm"
            bg={palette.surface}
            display="grid"
            placeItems="center"
          >
            {props.working
              ? <Spinner size="sm" color={palette.text} />
              : <Text fontSize="xs" color={palette.secondaryText}>No chart</Text>}
          </Box>
        )}
      <HStack mt="1.5" gap="1" align="start">
        <Box flex="1" minW="0">
          <Text fontSize="sm" fontWeight="medium" lineClamp={2}>{chart.title}</Text>
          <Text fontSize="xs" color="fg.muted">
            {dateFormat.format(chart.createdAt)} · {describeData(chart.data)}
          </Text>
        </Box>
        {confirming
          ? (
            <Button
              size="2xs"
              colorPalette="red"
              onClick={(e) => {
                e.stopPropagation();
                deleteChart(chart.id);
              }}
            >
              Delete
            </Button>
          )
          : (
            <IconButton
              size="2xs"
              variant="ghost"
              aria-label={`Delete ${chart.title}`}
              disabled={props.working}
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              <LuTrash2 />
            </IconButton>
          )}
      </HStack>
    </Box>
  );
}

function EntryView({ entry }: { entry: Entry }) {
  switch (entry.is) {
    case "user":
      return (
        <Box alignSelf="end" maxW="85%" bg="bg.emphasized" rounded="lg" px="3" py="2">
          <MarkdownText text={entry.text} />
        </Box>
      );
    case "visualizer":
      return <MarkdownText text={entry.text} />;
    case "note":
      return <Text fontSize="sm" color="fg.muted" textAlign="center">{entry.text}</Text>;
    default:
      return entry.is satisfies never;
  }
}

export function VisualizerFullScreen(
  { widgetId, closeFullScreen }: FullScreenProps<VisualizerConfig>,
) {
  // The layout regime: three or more columns show everything; two swap the list of charts
  // for previous/next buttons; one shows only the list, picking a chart for the column.
  const columns = useColumnsPerView();
  const charts = useCharts(widgetId);
  const inCard = useShownInCard(widgetId);
  const working = useWorking();
  const agent = useVisualize();
  const [selectedId, setSelectedId] = useState<string | null>(inCard ?? charts.at(0)?.id ?? null);
  const chart = charts.find((c) => c.id === selectedId) ?? charts.at(0) ?? null;
  const [versionIndex, setVersionIndex] = useState(0);
  const [message, setMessage] = useState("");

  // Shows the latest version of the chart picked, and each new one as it's made.
  const versions = chart?.versions.length ?? 0;
  useEffect(() => setVersionIndex(Math.max(0, versions - 1)), [chart?.id, versions]);

  const select = (id: string) => {
    setSelectedId(id);
    showInCard(widgetId, id);
  };

  const progress = chart === null ? undefined : working.get(chart.id);
  const version = chart?.versions.at(versionIndex) ?? null;
  const { flash, copy } = useCopy(chart, version);
  const canSend = chart !== null && progress === undefined && message.trim() !== "";

  const send = () => {
    if (!canSend) return;
    agent.visualize(chart, message.trim(), versionIndex);
    setMessage("");
  };

  const chartList = (
    onSelect: (id: string) => void,
    props: { w?: string; borderRightWidth?: string; flex?: string },
  ) => (
    <Stack as="nav" aria-label="Charts" p="3" gap="2" overflowY="auto" {...props}>
      {charts.length === 0 && (
        <Text fontSize="sm" color="fg.muted" p="2">
          No charts yet. Paste data into the box in the column.
        </Text>
      )}
      {charts.map((c) => (
        <ChartListItem
          key={c.id}
          chart={c}
          selected={c.id === chart?.id}
          working={working.has(c.id)}
          onSelect={() => onSelect(c.id)}
        />
      ))}
    </Stack>
  );

  if (columns <= 1) {
    return (
      <Box display="flex" flexDirection="column" h="full" w="full" bg="bg" color="fg">
        <Text fontSize="sm" color="fg.muted" px="4" pt="3">
          This view is limited at this size. For full functionality, widen your browser window or zoom out.
          Click a chart below to show on the main page.
        </Text>
        {chartList((id) => {
          select(id);
          closeFullScreen();
        }, { flex: "1" })}
      </Box>
    );
  }

  const index = charts.findIndex((c) => c.id === chart?.id);
  const step = (by: number) => {
    const next = charts.at(index + by);
    if (next !== undefined) select(next.id);
  };

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      {columns >= 3 && chartList(select, { w: "15rem", borderRightWidth: "1px" })}

      <Stack flex="1" minW="0" p="5" gap="3">
        {columns === 2 && charts.length > 1 && (
          <HStack gap="1" justify="center">
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Previous chart"
              disabled={index <= 0}
              onClick={() => step(-1)}
            >
              <LuChevronLeft />
            </IconButton>
            <Text fontSize="sm" color="fg.muted">Chart {index + 1} of {charts.length}</Text>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Next chart"
              disabled={index < 0 || index >= charts.length - 1}
              onClick={() => step(1)}
            >
              <LuChevronRight />
            </IconButton>
          </HStack>
        )}
        {chart !== null && (
          <HStack gap="3">
            <Box flex="1" minW="0">
              <Text fontSize="lg" fontWeight="medium" lineClamp={1}>{chart.title}</Text>
              <Text fontSize="sm" color="fg.muted">{describeData(chart.data)}</Text>
            </Box>
            <CopyMenu
              portalled={false}
              onCopy={copy}
              trigger={
                <Button size="xs" variant="outline" disabled={version === null}>
                  Copy as <LuChevronDown />
                </Button>
              }
            />
            {versions > 1 && (
              <HStack gap="1">
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Earlier version"
                  disabled={versionIndex === 0}
                  onClick={() => setVersionIndex(versionIndex - 1)}
                >
                  <LuChevronLeft />
                </IconButton>
                <Text fontSize="sm" color="fg.muted">Version {versionIndex + 1} of {versions}</Text>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Later version"
                  disabled={versionIndex >= versions - 1}
                  onClick={() => setVersionIndex(versionIndex + 1)}
                >
                  <LuChevronRight />
                </IconButton>
              </HStack>
            )}
          </HStack>
        )}
        <Box flex="1" minH="0" display="grid" placeItems="start center" position="relative">
          <CopyFlash flash={flash} />
          {version !== null && (
            <ChartSvg
              svg={version.svg}
              label={chart?.title ?? "Chart"}
              aspectRatio={chartAspect}
              w="full"
              maxH="full"
              maxW="calc((100vh - 8rem) * 1.6)"
              rounded="md"
              p="2"
              opacity={progress === undefined ? 1 : 0.4}
            />
          )}
          {chart !== null && version === null && progress === undefined && (
            <Text color="fg.muted">No chart yet. Ask for one in the chat.</Text>
          )}
          {progress !== undefined && (
            <Stack position="absolute" align="center" gap="2">
              <Spinner />
              <Text fontSize="sm">{progress}</Text>
            </Stack>
          )}
        </Box>
      </Stack>

      <Box
        w="24rem"
        flexShrink="0"
        borderLeftWidth="1px"
        display="flex"
        flexDirection="column"
      >
        <Box flex="1" minH="0" overflowY="auto" display="flex" flexDirection="column-reverse">
          {/* column-reverse keeps the view pinned to the end, like a terminal. */}
          <Stack px="4" py="4" gap="3" flexShrink="0" mb="auto">
            {chart !== null && chart.entries.length === 0 && progress === undefined && (
              <Text color="fg.muted" fontSize="sm">
                Ask for changes: "make it a line chart", "only 2025", "sort the bars", "group by
                region".
              </Text>
            )}
            {chart?.entries.map((entry, i) => <EntryView key={i} entry={entry} />)}
            {agent.busy && progress !== undefined && (
              <chakra.div alignSelf="start">
                <Button size="xs" variant="outline" onClick={agent.cancel}>Stop</Button>
              </chakra.div>
            )}
          </Stack>
        </Box>
        <Box borderTopWidth="1px" p="3">
          <HStack gap="2" align="end">
            <Textarea
              rows={2}
              autoresize
              placeholder={chart === null
                ? "Paste data in the column first"
                : "What should change? (Enter sends)"}
              disabled={chart === null}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <IconButton aria-label="Send" disabled={!canSend} onClick={send}>
              <LuSend />
            </IconButton>
          </HStack>
        </Box>
      </Box>
    </Box>
  );
}
