/**
 * Shows a widget agent's run (see agent-run.ts): what it's doing, what it's asking
 * the user to allow, and how it ended, with any files it wrote to download. The
 * widget shows the answer itself.
 */
import { Box, Button, HStack, Link, Spinner, Stack, Text } from "@chakra-ui/react";
import { LuDownload, LuShieldQuestion } from "react-icons/lu";
import type { RunView } from "./agent-run.ts";

/** Most progress lines shown: the latest. */
const shownProgress = 6;

function AskCard(props: {
  ask: { capability: string; action: string; detail: string };
  onAnswer: (allow: boolean, forRun: boolean) => void;
}) {
  const { ask } = props;
  return (
    <Box borderWidth="1px" borderColor="border.warning" bg="bg.warning" rounded="md" p="4">
      <HStack gap="2" align="start">
        <Box color="fg.warning" fontSize="lg" flexShrink="0" mt="0.5">
          <LuShieldQuestion />
        </Box>
        <Stack gap="1" minW="0">
          <Text fontWeight="semibold">The agent wants to: {ask.action}</Text>
          {ask.detail !== "" && (
            <Text fontSize="sm" fontFamily="mono" wordBreak="break-all">{ask.detail}</Text>
          )}
          <Text fontSize="xs" color="fg.muted">
            It asks you each time it does this: {ask.capability}.
          </Text>
        </Stack>
      </HStack>
      <HStack gap="2" mt="3" justify="end" wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => props.onAnswer(false, false)}>
          Don't allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => props.onAnswer(true, true)}>
          Allow for this run
        </Button>
        <Button size="sm" onClick={() => props.onAnswer(true, false)}>Allow once</Button>
      </HStack>
    </Box>
  );
}

export function AgentRunPanel<A>(props: {
  view: RunView<A>;
  onAnswer: (allow: boolean, forRun: boolean) => void;
  onCancel: () => void;
  /** Where to download a file the run wrote. */
  fileUrl: (name: string) => string;
}) {
  const { view } = props;
  if (view.is === "idle") return null;
  const progress = view.is === "starting" ? [] : view.progress.slice(-shownProgress);
  return (
    <Stack gap="3">
      {(view.is === "starting" || view.is === "running") && (
        <HStack justify="space-between" gap="3">
          <HStack gap="2" color="fg.muted" fontSize="sm">
            <Spinner size="xs" />
            <Text>
              {view.is === "starting"
                ? "Starting…"
                : view.ask !== null
                ? "Waiting for you…"
                : "Working…"}
            </Text>
          </HStack>
          {view.is === "running" && (
            <Button size="xs" variant="ghost" onClick={props.onCancel}>Stop</Button>
          )}
        </HStack>
      )}
      {progress.length > 0 && view.is !== "done" && (
        <Stack gap="0.5" fontSize="xs" color="fg.muted">
          {progress.map((line, i) => <Text key={i} truncate>{line}</Text>)}
        </Stack>
      )}
      {view.is === "running" && view.ask !== null && (
        <AskCard ask={view.ask} onAnswer={props.onAnswer} />
      )}
      {view.is === "failed" && <Text color="fg.error" fontSize="sm">{view.message}</Text>}
      {view.is === "cancelled" && <Text color="fg.muted" fontSize="sm">Stopped.</Text>}
      {view.is === "done" && view.files.length > 0 && (
        <Stack gap="1">
          {view.files.map((file) => (
            <Link
              key={file.name}
              href={props.fileUrl(file.name)}
              download={file.name}
              fontSize="sm"
              colorPalette="blue"
            >
              <LuDownload /> {file.name}
            </Link>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
