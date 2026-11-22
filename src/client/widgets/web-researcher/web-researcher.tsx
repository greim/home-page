/**
 * The web researcher's views: a button in its column, and the full-screen view where
 * a topic is researched by its agent and the report shown.
 */
import { MarkdownText } from "../../widget-kit/markdown-text.tsx";
import {
  Box,
  Button,
  chakra,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import {
  LuChevronLeft,
  LuChevronRight,
  LuGlobe,
  LuMaximize2,
  LuSearch,
  LuSend,
  LuTrash2,
} from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import { useAgentRun } from "../../widget-kit/agent-run.ts";
import { AgentRunPanel } from "../../widget-kit/agent-run-panel.tsx";
import { useBoxHeight } from "../../widget-kit/box-height.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import {
  type FullScreenProps,
  useColumnsPerView,
  type WidgetProps,
} from "../../widget-kit/views.tsx";
import { addResearch, deleteResearch, useHistory } from "./history-live.ts";
import { requestTopic, useTopicRequests } from "./request-live.ts";
import { isWebLink, ResearchReport, siteOf, type WebResearcherConfig } from "./config.ts";

export function WebResearcher(
  { config, widgetId, openFullScreen }: WidgetProps<WebResearcherConfig>,
) {
  const heading = config.heading.trim();
  const [text, setText] = useState("");
  const box = useBoxHeight(widgetId);
  const go = () => {
    const topic = text.trim();
    if (topic !== "") requestTopic(widgetId, topic);
    setText("");
    openFullScreen();
  };
  return (
    <>
      {heading !== "" && (
        <chakra.h3 {...widgetHeading} display="flex" alignItems="center" gap="0.5rem">
          <LuGlobe aria-hidden />
          {heading}
        </chakra.h3>
      )}
      <TextBox
        fontFamily="body"
        mb="0.6rem"
        minH="5rem"
        {...box}
        aria-label="What to research on the web"
        placeholder="What do you want to learn about today?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
      />
      <HStack gap="0.5rem">
        <TextBoxButton disabled={text === ""} onClick={() => setText("")}>Clear</TextBoxButton>
        <TextBoxButton aria-label="Research it" disabled={text.trim() === ""} onClick={go}>
          <LuSend />
        </TextBoxButton>
        <TextBoxButton ms="auto" onClick={openFullScreen}>
          <LuMaximize2 /> Full screen
        </TextBoxButton>
      </HStack>
    </>
  );
}

function Report(props: { report: ResearchReport }) {
  const { report } = props;
  return (
    <Stack gap="4" maxW="48rem">
      <Heading size="lg">{report.title}</Heading>
      <Text>{report.summary}</Text>
      {report.sections.map((section, i) => (
        <Box key={i}>
          <Heading size="sm" mb="2">{section.heading}</Heading>
          <MarkdownText text={section.body} />
        </Box>
      ))}
      {report.sources.length > 0 && (
        <Box>
          <Heading size="sm" mb="2">Sources</Heading>
          <Stack as="ol" ps="6" gap="1" fontSize="sm" listStyleType="decimal">
            {report.sources.map((source, i) => (
              <chakra.li key={i}>
                {isWebLink(source.url)
                  ? (
                    <Link
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      colorPalette="blue"
                    >
                      {source.title}
                    </Link>
                  )
                  : source.title} <chakra.span color="fg.muted">{siteOf(source.url)}</chakra.span>
              </chakra.li>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

export function WebResearcherFullScreen({ widgetId }: FullScreenProps<WebResearcherConfig>) {
  // Two columns or fewer have no room for the box and the past research beside the report:
  // they drop them, and step through the past research with buttons instead.
  const columns = useColumnsPerView();
  const narrow = columns <= 2;
  const [topic, setTopic] = useState("");
  const run = useAgentRun("research", ResearchReport);
  const history = useHistory(widgetId);
  // The past research being read; null to show the current run.
  const [selected, setSelected] = useState<string | null>(null);
  const asked = useRef("");
  const recorded = useRef<typeof run.view | null>(null);
  const busy = run.view.is === "starting" || run.view.is === "running";

  const begin = (about: string) => {
    asked.current = about;
    setSelected(null);
    run.start({ topic: about });
  };

  // A topic typed in the column starts the research as soon as the view shows; if it's
  // busy, it goes in the box instead, to start when the user is ready.
  useTopicRequests(widgetId, (requested) => {
    setTopic(requested);
    if (!busy) begin(requested);
  });

  // Keeps each finished report, once, and shows it.
  useEffect(() => {
    const view = run.view;
    if (view.is !== "done" || recorded.current === view) return;
    recorded.current = view;
    const id = crypto.randomUUID();
    addResearch(widgetId, {
      id,
      topic: asked.current,
      createdAt: Date.now(),
      report: view.output,
    });
    setSelected(id);
  }, [run.view]);

  const reading = history.find((h) => h.id === selected) ?? null;
  const index = history.findIndex((h) => h.id === reading?.id);
  // Past research is newest first, and the new topic comes after the newest: previous goes
  // to older research, next back toward the new topic.
  const step = (by: number) => {
    const next = history.at(index + by);
    setSelected(next === undefined || index + by < 0 ? null : next.id);
  };

  const ask = (
    <>
      <Box>
        <Text fontWeight="medium" mb="2">What should it look into?</Text>
        <Textarea
          rows={4}
          placeholder="e.g. How does a transistor work?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </Box>
      <Button
        alignSelf="start"
        disabled={topic.trim() === "" || busy}
        loading={busy}
        loadingText="Researching…"
        onClick={() => begin(topic.trim())}
      >
        <LuSearch /> Research
      </Button>
      <AgentRunPanel
        view={run.view}
        onAnswer={run.answer}
        onCancel={run.cancel}
        fileUrl={run.fileUrl}
      />
      {run.view.is === "done" && (
        <Text fontSize="xs" color="fg.muted">
          The research cost ${run.view.costUsd.toFixed(3)}.
        </Text>
      )}
    </>
  );

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      {!narrow && (
        <Stack w="26rem" flexShrink="0" p="5" gap="4" borderRightWidth="1px" overflowY="auto">
          {ask}
          {history.length > 0 && (
            <Box>
              <Text fontWeight="medium" mb="2">Past research</Text>
              <Stack gap="1">
                {history.map((h) => (
                  <HStack key={h.id} gap="1">
                    <Button
                      flex="1"
                      minW="0"
                      size="sm"
                      justifyContent="start"
                      variant={h.id === selected ? "subtle" : "ghost"}
                      title={h.topic}
                      onClick={() => setSelected(h.id)}
                    >
                      <Text truncate>{h.topic}</Text>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete: ${h.topic}`}
                      onClick={() => {
                        if (h.id === selected) {
                          setSelected(null);
                        }
                        deleteResearch(widgetId, h.id);
                      }}
                    >
                      <LuTrash2 />
                    </Button>
                  </HStack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
      <Box flex="1" minW="0" p="5" overflowY="auto">
        {narrow && (
          <HStack gap="1" justify="center" mb="4">
            <Button
              size="xs"
              variant="ghost"
              aria-label="Previous research"
              disabled={index >= history.length - 1}
              onClick={() => step(1)}
            >
              <LuChevronLeft />
            </Button>
            <Text fontSize="sm" color="fg.muted" truncate>
              {index < 0 ? "New topic" : `${index + 1} of ${history.length}`}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Next research"
              disabled={index < 0}
              onClick={() => step(-1)}
            >
              <LuChevronRight />
            </Button>
          </HStack>
        )}
        {reading !== null
          ? <Report report={reading.report} />
          : narrow
          ? <Stack gap="4" maxW="48rem">{ask}</Stack>
          : run.view.is === "done"
          ? <Report report={run.view.output} />
          : (
            <Text color="fg.muted" fontSize="sm">
              Claude searches the web on its own, and asks you before reading each page (or you can
              let it read pages for the rest of the run). Then it writes a short report with its
              sources.
            </Text>
          )}
      </Box>
    </Box>
  );
}
