/**
 * The visualizer's full-screen view: past charts down the left (to pick or delete),
 * the chosen chart large in the middle (with its earlier versions), and a chat on the
 * right to refine it with the agent.
 */
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
import { LuChevronLeft, LuChevronRight, LuSend, LuTrash2 } from "react-icons/lu";
import type { FullScreenProps } from "../../widget-kit/views.tsx";
import { ChartSvg } from "./chart-view.tsx";
import { type Chart, describeData, type Entry, latest } from "./charts.ts";
import type { VisualizerConfig } from "./config.ts";
import { palette } from "./palette.ts";
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
            svg={version.columnSvg}
            label={chart.title}
            aspectRatio="408 / 260"
            rounded="sm"
          />
        )
        : (
          <Box
            aspectRatio="408 / 260"
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
          <Text whiteSpace="pre-wrap">{entry.text}</Text>
        </Box>
      );
    case "visualizer":
      return <Text whiteSpace="pre-wrap">{entry.text}</Text>;
    case "note":
      return <Text fontSize="sm" color="fg.muted" textAlign="center">{entry.text}</Text>;
    default:
      return entry.is satisfies never;
  }
}

export function VisualizerFullScreen({ widgetId }: FullScreenProps<VisualizerConfig>) {
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
  const canSend = chart !== null && progress === undefined && message.trim() !== "";

  const send = () => {
    if (!canSend) return;
    agent.visualize(chart, message.trim(), versionIndex);
    setMessage("");
  };

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack
        as="nav"
        aria-label="Charts"
        w="15rem"
        flexShrink="0"
        p="3"
        gap="2"
        borderRightWidth="1px"
        overflowY="auto"
      >
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
            onSelect={() => select(c.id)}
          />
        ))}
      </Stack>

      <Stack flex="1" minW="0" p="5" gap="3">
        {chart !== null && (
          <HStack gap="3">
            <Box flex="1" minW="0">
              <Text fontSize="lg" fontWeight="medium" lineClamp={1}>{chart.title}</Text>
              <Text fontSize="sm" color="fg.muted">{describeData(chart.data)}</Text>
            </Box>
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
        <Box flex="1" minH="0" display="grid" placeItems="center" position="relative">
          {version !== null && (
            <ChartSvg
              svg={version.fullSvg}
              label={chart?.title ?? "Chart"}
              aspectRatio="960 / 600"
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
