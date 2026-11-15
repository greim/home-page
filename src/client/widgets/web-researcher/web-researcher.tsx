/**
 * The web researcher's views: a button in its column, and the full-screen view where
 * a topic is researched by its agent and the report shown.
 */
import { Box, Button, chakra, Heading, Link, Stack, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { LuGlobe, LuSearch } from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import { useAgentRun } from "../../widget-kit/agent-run.ts";
import { AgentRunPanel } from "../../widget-kit/agent-run-panel.tsx";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import type { FullScreenProps, WidgetProps } from "../../widget-kit/views.tsx";
import { requestTopic, useTopicRequests } from "./request-live.ts";
import { isWebLink, ResearchReport, siteOf, type WebResearcherConfig } from "./config.ts";

export function WebResearcher(
  { config, widgetId, openFullScreen }: WidgetProps<WebResearcherConfig>,
) {
  const heading = config.heading.trim();
  const [text, setText] = useState("");
  const go = () => {
    const topic = text.trim();
    if (topic !== "") requestTopic(widgetId, topic);
    setText("");
    openFullScreen();
  };
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <TextBox
        mb="0.6rem"
        minH="5rem"
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
      <TextBoxButton onClick={go}>
        <LuGlobe /> {text.trim() === "" ? "Research something" : "Research it"}
      </TextBoxButton>
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
          {section.body.split(/\n\s*\n/).map((paragraph, j) => (
            <Text key={j} mb="2" whiteSpace="pre-wrap">{paragraph}</Text>
          ))}
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
  const [topic, setTopic] = useState("");
  const run = useAgentRun("research", ResearchReport);
  const busy = run.view.is === "starting" || run.view.is === "running";

  // A topic typed in the column starts the research as soon as the view shows; if it's
  // busy, it goes in the box instead, to start when the user is ready.
  useTopicRequests(widgetId, (asked) => {
    setTopic(asked);
    if (!busy) run.start({ topic: asked });
  });

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack w="26rem" flexShrink="0" p="5" gap="4" borderRightWidth="1px" overflowY="auto">
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
          onClick={() => run.start({ topic: topic.trim() })}
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
      </Stack>
      <Box flex="1" minW="0" p="5" overflowY="auto">
        {run.view.is === "done"
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
