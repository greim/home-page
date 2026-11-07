/**
 * Pieces of an assistant conversation, shared by the assistant window and the
 * assistant widget: permission requests and questions waiting on the user, tool
 * calls (collapsible, with diffs for edits), and the agent's Markdown text.
 */
import { Box, Button, chakra, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useState } from "react";
import { LuCheck, LuChevronDown, LuChevronRight, LuRefreshCw, LuX } from "react-icons/lu";
import Markdown from "react-markdown";
import type { Answer, PermissionChoice, Question } from "../../common/assistant.ts";
import type { ChatEntry } from "./chat.ts";
import { type DiffRow, toolView } from "./tool-view.ts";

/** The tool the agent uses to present a plan for approval, in plan mode. */
const planTool = "ExitPlanMode";

/**
 * The agent's plan, waiting for approval: approve it (and accept the edits that carry
 * it out, or keep asking before each), or have the agent keep planning.
 */
export function PlanEntry(props: {
  entry: Extract<ChatEntry, { is: "permission" }>;
  onAnswer: (answer: Answer) => void;
}) {
  const { entry } = props;
  const choose = (choice: PermissionChoice) => props.onAnswer({ is: "permission", choice });
  const outcome = {
    waiting: null,
    allowed: "Approved",
    denied: "Kept planning",
    cancelled: "No longer needed",
  }[entry.state];
  return (
    <Stack gap="2" fontSize="sm" borderWidth="1px" borderColor="fg/30" rounded="l2" p="3">
      <Text fontWeight="medium">The assistant's plan:</Text>
      <MarkdownText text={entry.detail} />
      {outcome === null
        ? (
          <HStack gap="1.5" flexWrap="wrap">
            <Button size="xs" onClick={() => choose("accept-edits")}>
              Approve, and accept edits
            </Button>
            <Button size="xs" variant="outline" onClick={() => choose("allow")}>
              Approve, ask before edits
            </Button>
            <Button size="xs" variant="ghost" onClick={() => choose("deny")}>Keep planning</Button>
          </HStack>
        )
        : <Text fontSize="xs" color="fg.muted">{outcome}</Text>}
    </Stack>
  );
}

/** What the agent wants to do, with buttons to allow or deny it while it waits. */
export function PermissionEntry(props: {
  entry: Extract<ChatEntry, { is: "permission" }>;
  onAnswer: (answer: Answer) => void;
}) {
  const { entry } = props;
  if (entry.tool === planTool) return <PlanEntry {...props} />;
  const choose = (choice: PermissionChoice) => props.onAnswer({ is: "permission", choice });
  const outcome = {
    waiting: null,
    allowed: "Allowed",
    denied: "Denied",
    cancelled: "No longer needed",
  }[entry.state];
  return (
    <Stack gap="1.5" fontSize="sm" borderWidth="1px" borderColor="fg/30" rounded="l2" p="2">
      <Text fontWeight="medium">The assistant wants to use {entry.tool}:</Text>
      <Text
        fontFamily="mono"
        fontSize="xs"
        whiteSpace="pre-wrap"
        wordBreak="break-all"
        maxH="8rem"
        overflowY="auto"
      >
        {entry.detail}
      </Text>
      {outcome === null
        ? (
          <HStack gap="1.5" flexWrap="wrap">
            <Button size="xs" onClick={() => choose("allow")}>Allow</Button>
            {entry.canAlways && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => choose("always")}
              >
                Always allow
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => choose("deny")}>Deny</Button>
          </HStack>
        )
        : <Text fontSize="xs" color="fg.muted">{outcome}</Text>}
    </Stack>
  );
}

/** The agent's questions, each with its options to pick from, while it waits. */
export function QuestionEntry(props: {
  entry: Extract<ChatEntry, { is: "question" }>;
  onAnswer: (answer: Answer) => void;
}) {
  const { entry } = props;
  const [picked, setPicked] = useState<ReadonlyMap<string, ReadonlyArray<string>>>(new Map());
  const waiting = entry.state === "waiting";
  const toggle = (question: Question, label: string) => {
    const current = picked.get(question.question) ?? [];
    const next = question.multiSelect
      ? current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
      : [label];
    setPicked(new Map(picked).set(question.question, next));
  };
  const complete = entry.questions.every((q) => (picked.get(q.question) ?? []).length > 0);
  const submit = () =>
    props.onAnswer({
      is: "question",
      answers: Object.fromEntries(
        entry.questions.map((q) => [q.question, (picked.get(q.question) ?? []).join(", ")]),
      ),
    });
  return (
    <Stack gap="2" fontSize="sm" borderWidth="1px" borderColor="fg/30" rounded="l2" p="2">
      {entry.questions.map((q) => (
        <Stack key={q.question} gap="1">
          <Text fontWeight="medium">{q.question}</Text>
          <HStack gap="1.5" flexWrap="wrap">
            {q.options.map((o) => (
              <Button
                key={o.label}
                size="xs"
                title={o.description}
                variant={(picked.get(q.question) ?? []).includes(o.label) ? "solid" : "outline"}
                disabled={!waiting}
                onClick={() => toggle(q, o.label)}
              >
                {o.label}
              </Button>
            ))}
          </HStack>
        </Stack>
      ))}
      {waiting
        ? (
          <Button size="xs" alignSelf="flex-start" disabled={!complete} onClick={submit}>
            Answer
          </Button>
        )
        : (
          <Text fontSize="xs" color="fg.muted">
            {entry.state === "answered" ? "Answered" : "No longer needed"}
          </Text>
        )}
    </Stack>
  );
}

const mono = {
  fontFamily: "mono",
  fontSize: "xs",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
} as const;

const diffColors: Readonly<Record<DiffRow["kind"], { bg: string; mark: string }>> = {
  added: { bg: "green.500/15", mark: "+" },
  removed: { bg: "red.500/15", mark: "-" },
  same: { bg: "transparent", mark: " " },
};

function Diff(props: { rows: ReadonlyArray<DiffRow> }) {
  return (
    <Box {...mono} whiteSpace="pre" overflowX="auto">
      {props.rows.map((row, i) => (
        <Box key={i} bg={diffColors[row.kind].bg} px="1">
          {diffColors[row.kind].mark} {row.text}
        </Box>
      ))}
    </Box>
  );
}

/** Text that may be long, in a box that scrolls past a few lines. */
function Output(props: { children: ReactNode; error?: boolean }) {
  return (
    <Box
      {...mono}
      color={props.error ? "fg.error" : undefined}
      maxH="16rem"
      overflowY="auto"
      bg="bg.muted"
      rounded="l1"
      p="2"
    >
      {props.children}
    </Box>
  );
}

/** A tool the agent used: its one-line description, expanding to its input and result. */
export function ToolEntry(props: { entry: Extract<ChatEntry, { is: "tool" }> }) {
  const { entry } = props;
  const [open, setOpen] = useState(false);
  const view = toolView(entry.name, entry.input);
  const status = entry.result === null
    ? <Spinner size="xs" />
    : entry.result.isError
    ? <LuX color="var(--chakra-colors-fg-error)" />
    : <LuCheck />;
  return (
    <Stack gap="1" fontSize="sm">
      <chakra.button
        display="flex"
        alignItems="center"
        gap="1.5"
        color="fg.muted"
        textAlign="start"
        cursor="pointer"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <LuChevronDown /> : <LuChevronRight />}
        <Text truncate flex="1">{entry.label}</Text>
        {status}
      </chakra.button>
      {open && (
        <Stack gap="1.5" ps="5">
          {view.is === "diff" && (
            <>
              <Text fontSize="xs" color="fg.muted">{view.path}</Text>
              <Diff rows={view.rows} />
            </>
          )}
          {view.is === "command" && <Output>$ {view.command}</Output>}
          {view.is === "json" && <Output>{view.text}</Output>}
          {entry.result !== null && entry.result.text !== "" && (
            <Output error={entry.result.isError}>{entry.result.text}</Output>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** The agent's text, which is Markdown. Raw HTML in it is shown as text, never run. */
export function MarkdownText(props: { text: string }) {
  return (
    <Box
      fontSize="sm"
      lineHeight="1.6"
      css={{
        "& > :first-child": { marginTop: 0 },
        "& > :last-child": { marginBottom: 0 },
        "& p, & ul, & ol, & pre, & blockquote, & table": { marginBlock: "0.6em" },
        "& ul, & ol": { paddingInlineStart: "1.4em" },
        "& ul": { listStyleType: "disc" },
        "& ol": { listStyleType: "decimal" },
        "& h1, & h2, & h3, & h4": { fontWeight: "semibold", marginBlock: "0.8em 0.4em" },
        "& code": {
          fontFamily: "mono",
          fontSize: "0.9em",
          bg: "bg.muted",
          px: "0.25em",
          rounded: "l1",
        },
        "& pre": { bg: "bg.muted", p: "2", rounded: "l2", overflowX: "auto" },
        "& pre code": { bg: "transparent", px: 0 },
        "& a": { color: "fg.info", textDecoration: "underline" },
        "& blockquote": { borderInlineStartWidth: "2px", ps: "2", color: "fg.muted" },
        "& table": { borderCollapse: "collapse" },
        "& th, & td": { borderWidth: "1px", px: "1.5", py: "0.5" },
      }}
    >
      <Markdown
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {props.text}
      </Markdown>
    </Box>
  );
}

const noticeColors = { info: "fg.muted", success: "fg.success", error: "fg.error" } as const;

/** What the service is doing about the turn's changes, e.g. restarting the server. */
export function NoticeEntry(props: { entry: Extract<ChatEntry, { is: "notice" }> }) {
  return (
    <Text fontSize="xs" color={noticeColors[props.entry.tone]} whiteSpace="pre-wrap">
      {props.entry.text}
    </Text>
  );
}

/**
 * The page's code changed, so it offers to reload it. The page reloads only when asked:
 * a reload closes the assistant's window, which can be reopened from the page.
 */
export function ReloadEntry() {
  return (
    <HStack gap="2" fontSize="sm">
      <Text color="fg.muted">The page's code changed.</Text>
      <Button size="xs" variant="outline" onClick={() => location.reload()}>
        <LuRefreshCw /> Reload the page
      </Button>
    </HStack>
  );
}
