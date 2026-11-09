/**
 * The spreadsheet fixer's views: a button in its column, and the full-screen view
 * where a CSV is loaded, fixed by its agent, and the fixed copy downloaded.
 */
import { Box, Button, chakra, HStack, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { LuFileSpreadsheet, LuWandSparkles } from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import { useAgentRun } from "../../widget-kit/agent-run.ts";
import { AgentRunPanel } from "../../widget-kit/agent-run-panel.tsx";
import type { FullScreenProps, WidgetProps } from "../../widget-kit/views.tsx";
import { FixReport, type SpreadsheetFixerConfig } from "./config.ts";

export function SpreadsheetFixer({ config, openFullScreen }: WidgetProps<SpreadsheetFixerConfig>) {
  const heading = config.heading.trim();
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Text fontSize="0.9rem" mb="0.6rem">
        Clean up a messy CSV spreadsheet, and download the fixed copy.
      </Text>
      <Button size="sm" variant="outline" color="inherit" onClick={openFullScreen}>
        <LuFileSpreadsheet /> Fix a spreadsheet
      </Button>
    </>
  );
}

export function SpreadsheetFixerFullScreen(_props: FullScreenProps<SpreadsheetFixerConfig>) {
  const [file, setFile] = useState<File | null>(null);
  const [request, setRequest] = useState("");
  const run = useAgentRun("spreadsheet-fixer", "fix", FixReport);
  const busy = run.view.is === "starting" || run.view.is === "running";
  const report = run.view.is === "done" ? run.view.output : null;

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack w="28rem" flexShrink="0" p="5" gap="4" borderRightWidth="1px" overflowY="auto">
        <Box>
          <Text fontWeight="medium" mb="2">The spreadsheet (CSV)</Text>
          <Input
            type="file"
            accept=".csv,text/csv"
            p="1"
            onChange={(e) => setFile(e.target.files?.item(0) ?? null)}
          />
        </Box>
        <Box>
          <Text fontWeight="medium" mb="2">Anything in particular? (optional)</Text>
          <Textarea
            rows={4}
            placeholder="e.g. Split the name column into first and last names"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          />
        </Box>
        <Button
          alignSelf="start"
          disabled={file === null || busy}
          loading={busy}
          loadingText="Fixing…"
          onClick={() => file !== null && run.start({ file: file.name, request }, [file])}
        >
          <LuWandSparkles /> Fix it
        </Button>
        <AgentRunPanel
          view={run.view}
          onAnswer={run.answer}
          onCancel={run.cancel}
          fileUrl={run.fileUrl}
        />
        <Text fontSize="xs" color="fg.muted">
          The file goes to Claude's run folder on this computer, never into the page's layout, and
          is deleted half an hour after the run.
        </Text>
      </Stack>
      <Stack flex="1" minW="0" p="5" gap="4" overflowY="auto">
        {report === null
          ? (
            <Text color="fg.muted" fontSize="sm">
              Load a CSV file and press Fix it. Claude looks the sheet over, fixes stray spaces,
              inconsistent capitals, mixed date formats, empty and duplicate rows and messy headers,
              and writes a fixed copy for you to download. The original isn't changed.
            </Text>
          )
          : (
            <>
              <Text>{report.summary}</Text>
              <HStack>
                <Button asChild size="sm">
                  <a href={run.fileUrl(report.output)} download={report.output}>
                    Download {report.output}
                  </a>
                </Button>
              </HStack>
              {report.changes.length > 0 && (
                <Box>
                  <Text fontWeight="medium" mb="1">Changes</Text>
                  <Stack as="ul" ps="5" listStyleType="disc" gap="1" fontSize="sm">
                    {report.changes.map((change, i) => <chakra.li key={i}>{change}</chakra.li>)}
                  </Stack>
                </Box>
              )}
              {report.left.length > 0 && (
                <Box>
                  <Text fontWeight="medium" mb="1">Left for you</Text>
                  <Stack as="ul" ps="5" listStyleType="disc" gap="1" fontSize="sm">
                    {report.left.map((item, i) => <chakra.li key={i}>{item}</chakra.li>)}
                  </Stack>
                </Box>
              )}
            </>
          )}
      </Stack>
    </Box>
  );
}
