/**
 * The grammar check widget's views: a button in its column, and the full-screen
 * view where the text is checked. The text stays in the view while it's open, and
 * goes only to the widget's agent (Claude, through the assistant service).
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
import { useState } from "react";
import { LuArrowRight, LuCheck, LuSpellCheck, LuX } from "react-icons/lu";
import { widgetHeading } from "../../surface.ts";
import { runWidgetAgent } from "../../widget-kit/agents.ts";
import type { FullScreenProps, WidgetProps } from "../../widget-kit/views.tsx";
import type { GrammarCheckConfig } from "./config.ts";
import {
  applySuggestion,
  formatCost,
  GrammarReport,
  type Issue,
  kindLabels,
  maxTextLength,
} from "./report.ts";

export function GrammarCheck({ config, openFullScreen }: WidgetProps<GrammarCheckConfig>) {
  const heading = config.heading.trim();
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Text fontSize="0.9rem" mb="0.6rem">
        Check the grammar, wording and readability of a block of text.
      </Text>
      <Button size="sm" variant="outline" color="inherit" onClick={openFullScreen}>
        <LuSpellCheck /> Check some text
      </Button>
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

/** One issue: what's wrong, the fix, and buttons to apply or dismiss it. */
function IssueCard(props: {
  issue: Issue;
  canApply: boolean;
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
            title={props.canApply ? "Apply the fix" : "Those words aren't in the text anymore"}
            disabled={!props.canApply}
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
        <chakra.span textDecoration="line-through" color="fg.muted">{issue.excerpt}</chakra.span>
        <LuArrowRight />
        <chakra.span fontWeight="medium">{issue.suggestion}</chakra.span>
      </HStack>
    </Box>
  );
}

export function GrammarCheckFullScreen(_props: FullScreenProps<GrammarCheckConfig>) {
  const [text, setText] = useState("");
  const [check, setCheck] = useState<Check>({ is: "idle" });
  const tooLong = text.length > maxTextLength;

  const run = async () => {
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

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Stack flex="1" minW="0" p="5" gap="3">
        <Textarea
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
          <Button
            onClick={run}
            loading={check.is === "checking"}
            loadingText="Checking…"
            disabled={text.trim() === "" || tooLong}
          >
            <LuSpellCheck /> Check
          </Button>
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
                canApply={applySuggestion(text, issue) !== null}
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
