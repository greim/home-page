import { Box, Button, Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { Version } from "../common/apis/layout-history.ts";
import type { Layout } from "../common/model.ts";
import { FullScreenBody, FullScreenFooter } from "./full-screen/full-screen-host.tsx";
import { canRestore, type DiffLine, diffLines, versionDate } from "./history-view.ts";
import { layoutHistory } from "./layout-history-client.ts";
import type { PendingState } from "./pending-layout.ts";

/** The view's title, shown in its frame. */
export const historyTitle = "Layout history";

const mostVersions = 200;

type Loaded<A> =
  | { readonly is: "loading" }
  | { readonly is: "failed"; readonly message: string }
  | { readonly is: "ready"; readonly value: A };

const lineColor: Record<DiffLine["kind"], { color?: string; bg?: string }> = {
  added: { color: "green.fg", bg: "green.subtle" },
  removed: { color: "red.fg", bg: "red.subtle" },
  hunk: { color: "fg.muted" },
  context: {},
};

/** A version's change, as a diff. */
function Changes(props: { id: string }) {
  const [diff, setDiff] = useState<Loaded<string>>({ is: "loading" });
  useEffect(() => {
    setDiff({ is: "loading" });
    const abort = new AbortController();
    layoutHistory.changes({ id: props.id }, { signal: abort.signal }).then((result) => {
      if (abort.signal.aborted) return;
      setDiff(
        result.ok
          ? { is: "ready", value: result.value }
          : { is: "failed", message: result.error.message },
      );
    });
    return () => abort.abort();
  }, [props.id]);
  switch (diff.is) {
    case "loading":
      return <Spinner size="sm" />;
    case "failed":
      return <Text fontSize="sm" color="fg.error">{diff.message}</Text>;
    case "ready": {
      const lines = diffLines(diff.value);
      return lines.length === 0
        ? <Text fontSize="sm" color="fg.muted">This version has no changes to show.</Text>
        : (
          <Box fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
            {lines.map((line, i) => <Box key={i} {...lineColor[line.kind]}>{line.text}</Box>)}
          </Box>
        );
    }
    default:
      return diff satisfies never;
  }
}

/**
 * The layout's past versions, newest first, each with what it changed. Restoring one puts its
 * layout on the page as a change to accept or discard, like any other.
 */
export function HistoryView(props: {
  pending: PendingState;
  onRestored: (layout: Layout) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Loaded<ReadonlyArray<Version>>>({ is: "loading" });
  const [selected, setSelected] = useState(0);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    layoutHistory.versions({ limit: mostVersions }, { signal: abort.signal }).then((result) => {
      if (abort.signal.aborted) return;
      setVersions(
        result.ok
          ? { is: "ready", value: result.value }
          : { is: "failed", message: result.error.message },
      );
    });
    return () => abort.abort();
  }, []);

  const restore = async (id: string) => {
    setWorking(true);
    setProblem(null);
    const result = await layoutHistory.restore({ id });
    setWorking(false);
    if (result.ok) props.onRestored(result.value);
    else setProblem(result.error.message);
  };

  const body = () => {
    switch (versions.is) {
      case "loading":
        return <Spinner />;
      case "failed":
        return <Text color="fg.error">{versions.message}</Text>;
      case "ready": {
        const list = versions.value;
        if (list.length === 0) {
          return (
            <Text color="fg.muted">
              No versions yet. Accept a change to your layout to start its history.
            </Text>
          );
        }
        const chosen = list.at(selected) ?? list[0];
        const now = new Date();
        return (
          <Flex gap="4" minH="0" flex="1" align="stretch">
            <Stack as="ul" gap="1" w="18rem" flexShrink="0" m="0" p="0" listStyleType="none">
              {list.map((version, index) => (
                <li key={version.id}>
                  <Button
                    variant={index === selected ? "subtle" : "ghost"}
                    size="sm"
                    w="full"
                    h="auto"
                    py="2"
                    justifyContent="start"
                    textAlign="start"
                    whiteSpace="normal"
                    aria-pressed={index === selected}
                    onClick={() => setSelected(index)}
                  >
                    <Stack gap="0" align="start">
                      <Text fontWeight="medium">{version.message}</Text>
                      <Text fontSize="xs" color="fg.muted">
                        {versionDate(version.date, now)}
                        {index === 0 ? " · latest" : ""}
                      </Text>
                    </Stack>
                  </Button>
                </li>
              ))}
            </Stack>
            <Box flex="1" minW="0" overflow="auto">
              {chosen !== undefined && <Changes id={chosen.id} />}
            </Box>
          </Flex>
        );
      }
      default:
        return versions satisfies never;
    }
  };

  const chosen = versions.is === "ready" ? versions.value.at(selected) : undefined;
  const verdict = canRestore(selected, props.pending.pending, working);

  return (
    <>
      <FullScreenBody gap="3">{body()}</FullScreenBody>
      <FullScreenFooter>
        {problem !== null && <Text fontSize="sm" color="fg.error" me="auto">{problem}</Text>}
        {chosen !== undefined && !verdict.ok && (
          <Text fontSize="sm" color="fg.muted" me="auto">{verdict.reason}</Text>
        )}
        <Button variant="outline" onClick={props.onClose}>Close</Button>
        <Button
          disabled={chosen === undefined || !verdict.ok}
          onClick={() => chosen !== undefined && restore(chosen.id)}
        >
          Restore this version
        </Button>
      </FullScreenFooter>
    </>
  );
}
