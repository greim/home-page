/**
 * The grammar check widget's views: a text box and a button in its column, and the
 * full-screen view where the text is checked. Both show the same text (text-live.ts),
 * which is kept only until the page reloads, and goes only to the widget's agent
 * (Claude, through the assistant service).
 */
import {
  Badge,
  Box,
  Button,
  chakra,
  HStack,
  IconButton,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useRef, useState } from "react";
import { LuArrowRight, LuCheck, LuSpellCheck, LuX } from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import { runWidgetAgent } from "../../widget-kit/agents.ts";
import type { FullScreenProps, WidgetProps } from "../../widget-kit/views.tsx";
import type { GrammarCheckConfig } from "./config.ts";
import {
  applySuggestion,
  excerptRange,
  formatCost,
  GrammarReport,
  type Issue,
  kindLabels,
  maxTextLength,
} from "./report.ts";
import { requestCheck, useCheckRequests, useText } from "./text-live.ts";

export function GrammarCheck(
  { config, widgetId, openFullScreen }: WidgetProps<GrammarCheckConfig>,
) {
  const heading = config.heading.trim();
  const [text, setText] = useText(widgetId);
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <TextBox
        mb="0.6rem"
        aria-label="Text to check"
        placeholder="Paste text to check its grammar, wording and readability"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <HStack gap="0.5rem">
        <TextBoxButton
          onClick={() => {
            if (text.trim() !== "") requestCheck(widgetId);
            openFullScreen();
          }}
        >
          <LuSpellCheck /> {text.trim() === "" ? "Open the checker" : "Check it"}
        </TextBoxButton>
        <TextBoxButton disabled={text === ""} onClick={() => setText("")}>Clear</TextBoxButton>
      </HStack>
    </>
  );
}

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

/**
 * Selects `start`–`end` in the text box and scrolls it to the middle of the box. A
 * textarea doesn't scroll to a selection made from code in every browser, so this
 * finds where it is with an invisible copy of the box, laid out the same.
 */
const selectInBox = (box: HTMLTextAreaElement, start: number, end: number) => {
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
    marker.textContent = box.value.slice(start, end) || "\u200b";
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
  return (
    <Box borderWidth="1px" rounded="md" p="3">
      <HStack justify="space-between" align="start" gap="2">
        <Badge size="sm" variant="subtle">{kindLabels[issue.kind]}</Badge>
        <HStack gap="1">
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="Apply the fix"
            title={props.found ? "Apply the fix" : "Those words aren't in the text anymore"}
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
          title={props.found ? "Show it in the text" : "Those words aren't in the text anymore"}
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

export function GrammarCheckFullScreen({ widgetId }: FullScreenProps<GrammarCheckConfig>) {
  const [text, setText] = useText(widgetId);
  const [check, setCheck] = useState<Check>({ is: "idle" });
  const box = useRef<HTMLTextAreaElement>(null);
  const tooLong = text.length > maxTextLength;

  const canCheck = text.trim() !== "" && !tooLong && check.is !== "checking";

  const run = async () => {
    if (!canCheck) return;
    setCheck({ is: "checking" });
    const result = await runWidgetAgent("grammar-check", "check", { text }, GrammarReport);
    setCheck(
      result.ok
        ? { is: "done", ...result.value, costUsd: result.costUsd }
        : { is: "failed", message: result.errorMessage },
    );
  };

  const without = (issue: Issue) =>
    check.is === "done" ? { ...check, issues: check.issues.filter((i) => i !== issue) } : check;

  // "Check it" in the card starts a check straight away.
  useCheckRequests(widgetId, run);

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack flex="1" minW="0" p="5" gap="3">
        <Textarea
          ref={box}
          flex="1"
          resize="none"
          placeholder="Paste or type the text to check"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <HStack justify="space-between" gap="3">
          <Text fontSize="sm" color={tooLong ? "fg.error" : "fg.muted"}>
            {text.length.toLocaleString()} / {maxTextLength.toLocaleString()} characters
          </Text>
          <HStack gap="2">
            <Button
              variant="outline"
              disabled={text === "" || check.is === "checking"}
              onClick={() => {
                setText("");
                setCheck({ is: "idle" });
              }}
            >
              Clear
            </Button>
            <Button
              onClick={run}
              loading={check.is === "checking"}
              loadingText="Checking…"
              disabled={!canCheck}
            >
              <LuSpellCheck /> Check
            </Button>
          </HStack>
        </HStack>
      </Stack>
      <Stack w="26rem" flexShrink="0" borderLeftWidth="1px" p="5" gap="3" overflowY="auto">
        {check.is === "idle" && (
          <Text color="fg.muted" fontSize="sm">
            Claude checks the text for grammar, spelling, punctuation, wording, clarity and
            readability, and suggests fixes. The text isn't kept.
          </Text>
        )}
        {check.is === "checking" && (
          <Text color="fg.muted" fontSize="sm">
            Claude is reading it. This takes a few seconds.
          </Text>
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
            {check.issues.map((issue, i) => (
              <IssueCard
                key={`${i}:${issue.excerpt}`}
                issue={issue}
                found={excerptRange(text, issue) !== null}
                onLocate={() => {
                  const range = excerptRange(text, issue);
                  if (range !== null && box.current !== null) {
                    selectInBox(box.current, range.start, range.end);
                  }
                }}
                onApply={() => {
                  const fixed = applySuggestion(text, issue);
                  if (fixed === null) return;
                  setText(fixed);
                  setCheck(without(issue));
                }}
                onDismiss={() => setCheck(without(issue))}
              />
            ))}
          </>
        )}
      </Stack>
    </Box>
  );
}
