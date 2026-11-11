/**
 * The textualizer's full-screen view: what was pasted, formatted or as editable
 * source, in tabs; "Copy as…"; and, for prose (Markdown and HTML), a grammar
 * check by Claude (the manifest's "check" agent), whose fixes go into the source.
 * Checking HTML turns it into Markdown first, so fixes can be found and applied
 * as plain text.
 */
import {
  Badge,
  Box,
  Button,
  Center,
  chakra,
  HStack,
  IconButton,
  Stack,
  Tabs,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowRight, LuCheck, LuChevronDown, LuSpellCheck, LuX } from "react-icons/lu";
import { useWidgetAgent } from "../../widget-kit/agents.ts";
import type { FullScreenProps } from "../../widget-kit/views.tsx";
import { useBox } from "./box-live.ts";
import type { TextualizerConfig } from "./config.ts";
import { formattedTree, markdownOf } from "./convert.ts";
import { CopyFlash, CopyMenu, useCopy } from "./copy-menu.tsx";
import { parseHtml } from "./dom.ts";
import {
  applySuggestion,
  excerptRange,
  formatCost,
  GrammarReport,
  type Issue,
  issueKindLabels,
  maxTextLength,
} from "./report.ts";
import { checkable, kindLabels } from "./source.ts";
import { Formatted } from "./formatted.tsx";

type Tab = "formatted" | "source";

type Check =
  | { readonly is: "idle" }
  | { readonly is: "checking" }
  | { readonly is: "failed"; readonly message: string }
  | {
    readonly is: "done";
    readonly summary: string;
    readonly issues: ReadonlyArray<Issue>;
    readonly costUsd: number;
  };

type Range = { readonly start: number; readonly end: number };

/**
 * Selects `start`–`end` in the text box and scrolls it to the middle of the box. A
 * textarea doesn't scroll to a selection made from code in every browser, so this
 * finds where it is with an invisible copy of the box, laid out the same.
 */
const selectInBox = (box: HTMLTextAreaElement, { start, end }: Range) => {
  const doc = box.ownerDocument;
  const style = doc.defaultView?.getComputedStyle(box);
  if (style !== undefined) {
    const mirror = doc.createElement("div");
    Object.assign(mirror.style, {
      font: style.font,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      padding: style.padding,
      borderWidth: style.borderWidth,
      borderStyle: "solid",
      boxSizing: style.boxSizing,
      width: `${box.clientWidth + box.clientLeft * 2}px`,
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      position: "absolute",
      visibility: "hidden",
      top: "0",
      left: "-9999px",
    });
    mirror.textContent = box.value.slice(0, start);
    const marker = doc.createElement("span");
    marker.textContent = box.value.slice(start, end) || "​";
    mirror.append(marker);
    doc.body.append(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  }
  box.focus({ preventScroll: true });
  box.setSelectionRange(start, end);
};

/** One issue: what's wrong, the fix, and buttons to find, apply or dismiss it. */
function IssueCard(props: {
  issue: Issue;
  /** Whether the excerpt is still in the text, to find or fix. */
  found: boolean;
  onLocate: () => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { issue } = props;
  const gone = "Those words aren't in the text anymore";
  return (
    <Box borderWidth="1px" rounded="md" p="3">
      <HStack justify="space-between" align="start" gap="2">
        <Badge size="sm" variant="subtle">{issueKindLabels[issue.kind]}</Badge>
        <HStack gap="1">
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Apply the fix"
            title={props.found ? "Apply the fix" : gone}
            disabled={!props.found}
            onClick={props.onApply}
          >
            <LuCheck />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={props.onDismiss}
          >
            <LuX />
          </IconButton>
        </HStack>
      </HStack>
      <Text mt="2" fontSize="sm">{issue.problem}</Text>
      <HStack mt="2" gap="2" align="baseline" wrap="wrap" fontSize="sm">
        <chakra.button
          type="button"
          textAlign="start"
          textDecoration="line-through"
          color="fg.muted"
          rounded="sm"
          px="1"
          mx="-1"
          cursor={props.found ? "pointer" : "default"}
          _hover={props.found ? { bg: "bg.muted", color: "fg" } : {}}
          title={props.found ? "Show it in the source" : gone}
          disabled={!props.found}
          onClick={props.onLocate}
        >
          {issue.excerpt}
        </chakra.button>
        <LuArrowRight />
        <chakra.span fontWeight="medium">{issue.suggestion}</chakra.span>
      </HStack>
    </Box>
  );
}

/** The checker's side panel: what it does, how it's going, and what it found. */
function CheckPanel(props: {
  check: Check;
  text: string;
  onLocate: (range: Range) => void;
  onApply: (issue: Issue, fixed: string) => void;
  onDismiss: (issue: Issue) => void;
}) {
  const { check, text } = props;
  return (
    <Stack w="26rem" flexShrink="0" borderLeftWidth="1px" p="5" gap="3" overflowY="auto">
      {check.is === "idle" && (
        <Text color="fg.muted" fontSize="sm">
          Check grammar has Claude check the text for grammar, spelling, punctuation, wording,
          clarity and readability, and suggest fixes. Checking HTML turns it into Markdown.
        </Text>
      )}
      {check.is === "checking" && (
        <Text color="fg.muted" fontSize="sm">Claude is reading it. This takes a few seconds.</Text>
      )}
      {check.is === "failed" && <Text color="fg.error" fontSize="sm">{check.message}</Text>}
      {check.is === "done" && (
        <>
          <Text fontSize="sm">{check.summary}</Text>
          <Text fontSize="xs" color="fg.muted">
            {check.issues.length === 0
              ? "No issues left."
              : `${check.issues.length} issue${check.issues.length === 1 ? "" : "s"}.`}{" "}
            The check cost {formatCost(check.costUsd)}.
          </Text>
          {check.issues.map((issue, i) => {
            const range = excerptRange(text, issue);
            return (
              <IssueCard
                key={`${i}:${issue.excerpt}`}
                issue={issue}
                found={range !== null}
                onLocate={() => range !== null && props.onLocate(range)}
                onApply={() => {
                  const fixed = applySuggestion(text, issue);
                  if (fixed !== null) props.onApply(issue, fixed);
                }}
                onDismiss={() => props.onDismiss(issue)}
              />
            );
          })}
        </>
      )}
    </Stack>
  );
}

export function TextualizerFullScreen({ widgetId }: FullScreenProps<TextualizerConfig>) {
  const [box, setBox] = useBox(widgetId);
  const source = box.is === "preview" ? box.source : null;
  const [tab, setTab] = useState<Tab>("formatted");
  const [check, setCheck] = useState<Check>({ is: "idle" });
  // Text to select in the source once its tab is showing.
  const [selection, setSelection] = useState<Range | null>(null);
  const sourceBox = useRef<HTMLTextAreaElement>(null);
  const { flash, copy } = useCopy(source, parseHtml);
  const checkGrammar = useWidgetAgent("check", GrammarReport);
  const tree = useMemo(() => source === null ? null : formattedTree(source, parseHtml), [source]);

  // Cleared in the card: start over.
  useEffect(() => {
    if (source === null) setCheck({ is: "idle" });
  }, [source === null]);

  useEffect(() => {
    if (selection !== null && tab === "source" && sourceBox.current !== null) {
      selectInBox(sourceBox.current, selection);
      setSelection(null);
    }
  }, [selection, tab]);

  if (source === null) {
    return (
      <Center h="full" w="full" bg="bg" color="fg.muted" p="5">
        <Text>Nothing here yet. Paste into the widget's box, then open it full screen.</Text>
      </Center>
    );
  }

  const canCheck = checkable(source.kind);
  const text = canCheck ? markdownOf(source, parseHtml) : "";
  const tooLong = text.length > maxTextLength;

  const run = async () => {
    if (!canCheck || tooLong || text.trim() === "" || check.is === "checking") return;
    // Fixes are found and made as plain text, so HTML becomes Markdown first.
    if (source.kind !== "markdown") {
      setBox({ is: "preview", source: { kind: "markdown", data: text } });
    }
    setCheck({ is: "checking" });
    const result = await checkGrammar({ text });
    setCheck(
      result.ok
        ? { is: "done", ...result.value, costUsd: result.costUsd }
        : { is: "failed", message: result.errorMessage },
    );
  };

  const without = (issue: Issue) =>
    setCheck((c) => c.is === "done" ? { ...c, issues: c.issues.filter((i) => i !== issue) } : c);

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack flex="1" minW="0" p="5" gap="3">
        <Tabs.Root
          value={tab}
          onValueChange={(e) => setTab(e.value === "source" ? "source" : "formatted")}
        >
          <Tabs.List>
            <Tabs.Trigger value="formatted">Formatted</Tabs.Trigger>
            <Tabs.Trigger value="source">Source code</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <Box flex="1" minH="0" position="relative" display="flex">
          {tab === "formatted"
            ? (
              <Box flex="1" overflowY="auto" pe="2">
                {tree !== null && <Formatted tree={tree} />}
              </Box>
            )
            : (
              <Textarea
                ref={sourceBox}
                flex="1"
                resize="none"
                fontFamily="mono"
                fontSize="sm"
                spellCheck={false}
                aria-label={`${kindLabels[source.kind]} source`}
                value={source.data}
                onChange={(e) =>
                  setBox({ is: "preview", source: { ...source, data: e.target.value } })}
              />
            )}
          <CopyFlash flash={flash} />
        </Box>
        <HStack justify="space-between" gap="3">
          <HStack gap="3">
            <Badge variant="subtle">{kindLabels[source.kind]}</Badge>
            {canCheck && (
              <Text fontSize="sm" color={tooLong ? "fg.error" : "fg.muted"}>
                {text.length.toLocaleString()} / {maxTextLength.toLocaleString()} characters
              </Text>
            )}
          </HStack>
          <HStack gap="2">
            <CopyMenu
              portalled={false}
              onCopy={copy}
              trigger={
                <Button variant="outline">
                  Copy as <LuChevronDown />
                </Button>
              }
            />
            {canCheck && (
              <Button
                onClick={run}
                loading={check.is === "checking"}
                loadingText="Checking…"
                disabled={tooLong || text.trim() === ""}
              >
                <LuSpellCheck /> Check grammar
              </Button>
            )}
          </HStack>
        </HStack>
      </Stack>
      {canCheck && (
        <CheckPanel
          check={check}
          text={source.data}
          onLocate={(range) => {
            setTab("source");
            setSelection(range);
          }}
          onApply={(issue, fixed) => {
            setBox({ is: "preview", source: { ...source, data: fixed } });
            without(issue);
          }}
          onDismiss={without}
        />
      )}
    </Box>
  );
}
