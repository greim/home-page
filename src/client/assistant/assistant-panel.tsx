/**
 * The assistant's UI in its own window: a conversation with Claude Code in this
 * repo, as in a terminal. A header to switch conversations and permission mode,
 * the transcript (Markdown, tool calls, permission requests and questions), and
 * a composer that becomes a Stop button while the agent works.
 */
import {
  Box,
  Button,
  chakra,
  CloseButton,
  Flex,
  HStack,
  IconButton,
  Menu,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { Either } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  LuCheck,
  LuCircleStop,
  LuHistory,
  LuPaperclip,
  LuSend,
  LuSquarePen,
  LuTriangleAlert,
  LuX,
} from "react-icons/lu";
import type {
  AttachedImage,
  Capabilities,
  Command,
  ModelChoice,
  PermissionMode,
  SessionSummary,
} from "../../common/assistant.ts";
import { type Chat, type ChatEntry, usageText, waitingOnUser } from "./chat.ts";
import { attachProblem, matchingCommands, withCommand } from "./composer.ts";
import {
  MarkdownText,
  NoticeEntry,
  PermissionEntry,
  QuestionEntry,
  ReloadEntry,
  ToolEntry,
} from "./entries.tsx";
import { type Assistant, loadCapabilities, loadSessions } from "./use-assistant.ts";

/** The modes offered, with how the switch names them. */
const modes: ReadonlyArray<{ value: PermissionMode; label: string }> = [
  { value: "default", label: "Ask before acting" },
  { value: "acceptEdits", label: "Accept edits" },
  { value: "plan", label: "Plan first" },
];

/** e.g. "3 min ago", "yesterday", or a date. */
export const ago = (then: number, now: number): string => {
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString();
};

/** Past conversations, loaded when the menu opens, to pick one to continue. */
function SessionsMenu(props: { disabled: boolean; onPick: (sessionId: string) => void }) {
  const [sessions, setSessions] = useState<
    { is: "loading" } | { is: "loaded"; list: ReadonlyArray<SessionSummary> } | {
      is: "failed";
      message: string;
    }
  >({ is: "loading" });
  return (
    <Menu.Root
      onOpenChange={(d) => {
        if (!d.open) return;
        setSessions({ is: "loading" });
        loadSessions().then((r) =>
          setSessions(
            Either.isRight(r)
              ? { is: "loaded", list: r.right }
              : { is: "failed", message: r.left.message },
          )
        );
      }}
      onSelect={(d) => props.onPick(d.value)}
    >
      <Menu.Trigger asChild>
        <IconButton
          aria-label="Past conversations"
          title="Past conversations"
          size="sm"
          variant="ghost"
          disabled={props.disabled}
        >
          <LuHistory />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content maxH="24rem" overflowY="auto" maxW="22rem">
            {sessions.is === "loading" && (
              <Menu.Item value="" disabled>
                <Spinner size="xs" /> Loading…
              </Menu.Item>
            )}
            {sessions.is === "failed" && <Menu.Item value="" disabled>{sessions.message}
            </Menu.Item>}
            {sessions.is === "loaded" && sessions.list.length === 0 && (
              <Menu.Item value="" disabled>No past conversations</Menu.Item>
            )}
            {sessions.is === "loaded" &&
              sessions.list.map((s) => (
                <Menu.Item key={s.sessionId} value={s.sessionId}>
                  <Stack gap="0" minW="0">
                    <Text truncate>{s.title}</Text>
                    <Text fontSize="xs" color="fg.muted">{ago(s.lastModified, Date.now())}</Text>
                  </Stack>
                </Menu.Item>
              ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

/** Chooses the model for this conversation and later ones (blank: Claude Code's default). */
function ModelPicker(props: { assistant: Assistant; models: ReadonlyArray<ModelChoice> }) {
  const { chat } = props.assistant;
  // "default" is Claude Code's own name for leaving it unset.
  const choices = props.models.filter((m) => m.value !== "default");
  if (choices.length === 0) return null;
  return (
    <NativeSelect.Root size="sm" w="auto" title="Model">
      <NativeSelect.Field
        aria-label="Model"
        value={chat.model ?? ""}
        onChange={(e) => props.assistant.setModel(e.currentTarget.value || null)}
      >
        <option value="">Default model</option>
        {choices.map((m) => (
          <option key={m.value} value={m.value} title={m.description}>{m.displayName}</option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}

function Header(
  props: { assistant: Assistant; models: ReadonlyArray<ModelChoice>; onClose: () => void },
) {
  const { chat } = props.assistant;
  const mode = modes.some((m) => m.value === chat.mode) ? chat.mode : "default";
  return (
    <HStack gap="1" px="2" py="1.5" borderBottomWidth="1px" flexShrink="0">
      <IconButton
        aria-label="New conversation"
        title="New conversation"
        size="sm"
        variant="ghost"
        disabled={chat.busy || chat.entries.length === 0}
        onClick={props.assistant.reset}
      >
        <LuSquarePen />
      </IconButton>
      <SessionsMenu disabled={chat.busy} onPick={props.assistant.resume} />
      <Box flex="1" />
      <ModelPicker assistant={props.assistant} models={props.models} />
      <NativeSelect.Root
        size="sm"
        w="auto"
        title="Permission mode"
      >
        <NativeSelect.Field
          aria-label="Permission mode"
          value={mode ?? "default"}
          onChange={(e) => props.assistant.setMode(e.currentTarget.value as PermissionMode)}
        >
          {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <IconButton
        aria-label="Close the assistant"
        title="Close (the conversation carries on)"
        size="sm"
        variant="ghost"
        onClick={props.onClose}
      >
        <LuX />
      </IconButton>
    </HStack>
  );
}

function Entry(props: { entry: ChatEntry; assistant: Assistant }) {
  const { entry, assistant } = props;
  switch (entry.is) {
    case "user":
      return (
        <Box
          alignSelf="flex-end"
          maxW="85%"
          bg="bg.emphasized"
          px="3"
          py="2"
          rounded="l3"
          fontSize="sm"
          whiteSpace="pre-wrap"
        >
          {entry.text}
        </Box>
      );
    case "attachments":
      return (
        <HStack alignSelf="flex-end" gap="1" fontSize="xs" color="fg.muted">
          <LuPaperclip />
          {entry.count === 1 ? "1 image attached" : `${entry.count} images attached`}
        </HStack>
      );
    case "assistant":
      return <MarkdownText text={entry.text} />;
    case "tool":
      return <ToolEntry entry={entry} />;
    case "permission":
      return (
        <PermissionEntry
          entry={entry}
          onAnswer={(a) => assistant.answer(entry.requestId, a)}
        />
      );
    case "question":
      return <QuestionEntry entry={entry} onAnswer={(a) => assistant.answer(entry.requestId, a)} />;
    case "applied":
      return (
        <HStack gap="1.5" fontSize="sm" color="fg.success" fontWeight="medium">
          <LuCheck /> Applied to your page
        </HStack>
      );
    case "rejected":
      return (
        <HStack gap="1.5" fontSize="xs" color="fg.warning" alignItems="flex-start">
          <Box pt="0.5">
            <LuTriangleAlert />
          </Box>
          <Text whiteSpace="pre-wrap">Layout rejected, retrying: {entry.message}</Text>
        </HStack>
      );
    case "error":
      return <Text fontSize="sm" color="fg.error" whiteSpace="pre-wrap">{entry.message}</Text>;
    case "summary":
      return <Text fontSize="xs" color="fg.muted" textAlign="right">{entry.text}</Text>;
    case "notice":
      return <NoticeEntry entry={entry} />;
    case "reload":
      return <ReloadEntry />;
    default:
      return entry satisfies never;
  }
}

/** The conversation so far, following its end while the user is there. */
function Transcript(props: { chat: Chat; assistant: Assistant }) {
  const { chat } = props;
  const scroller = useRef<HTMLDivElement>(null);
  // Whether the view is at (or near) the end, so new output should keep it there.
  const atEnd = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el !== null && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [chat.entries, chat.draft, chat.busy]);

  return (
    <Stack
      ref={scroller}
      flex="1"
      minH="0"
      overflowY="auto"
      px="4"
      py="3"
      gap="3"
      onScroll={(e) => {
        const el = e.currentTarget;
        atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {chat.entries.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          This is Claude Code, working in your home page's repo, with your own settings and skills.
          Ask it to change your page (“add a column of news bookmarks”), write a new kind of widget,
          fix a bug, or commit your work.
        </Text>
      )}
      {chat.entries.map((entry, i) => <Entry key={i} entry={entry} assistant={props.assistant} />)}
      {chat.draft !== "" && <MarkdownText text={chat.draft} />}
      {chat.busy && chat.draft === "" && !waitingOnUser(chat) && (
        <HStack gap="2" fontSize="sm" color="fg.muted">
          <Spinner size="xs" /> Working…
        </HStack>
      )}
    </Stack>
  );
}

/** An image waiting to be sent, with a preview of it. */
type Attachment = { readonly image: AttachedImage; readonly previewUrl: string };

/** The files as attachments, and why any couldn't be attached. */
const readAttachments = async (files: ReadonlyArray<File>) => {
  const problems = files.flatMap((f) => {
    const problem = attachProblem(f);
    return problem === null ? [] : [problem];
  });
  const attachments = await Promise.all(
    files.filter((f) => attachProblem(f) === null).map(async (f): Promise<Attachment> => ({
      image: {
        mediaType: f.type as AttachedImage["mediaType"],
        data: new Uint8Array(await f.arrayBuffer()),
      },
      previewUrl: URL.createObjectURL(f),
    })),
  );
  return { attachments, problems };
};

/** Commands matching what's typed, to pick from (with the mouse, or Tab for the first). */
function CommandSuggestions(props: {
  matches: ReadonlyArray<Command>;
  onPick: (command: Command) => void;
}) {
  if (props.matches.length === 0) return null;
  return (
    <Stack gap="0" px="3" pt="2" maxH="14rem" overflowY="auto" borderTopWidth="1px">
      {props.matches.map((c) => (
        <chakra.button
          key={c.name}
          type="button"
          display="flex"
          gap="2"
          alignItems="baseline"
          textAlign="start"
          px="2"
          py="1"
          rounded="l1"
          cursor="pointer"
          _hover={{ bg: "bg.muted" }}
          onClick={() => props.onPick(c)}
        >
          <Text fontFamily="mono" fontSize="sm" flexShrink="0">/{c.name}</Text>
          <Text fontSize="xs" color="fg.muted" truncate>{c.description}</Text>
        </chakra.button>
      ))}
    </Stack>
  );
}

/**
 * Where the user writes. Enter sends; Shift+Enter starts a new line. Typing "/" offers
 * slash commands and skills; images can be pasted or dropped in.
 */
function Composer(props: { assistant: Assistant; commands: ReadonlyArray<Command> }) {
  const { chat } = props.assistant;
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ReadonlyArray<Attachment>>([]);
  const [problems, setProblems] = useState<ReadonlyArray<string>>([]);
  const matches = matchingCommands(draft, props.commands);
  const attach = (files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    readAttachments(files).then((read) => {
      setAttachments((current) => [...current, ...read.attachments]);
      setProblems(read.problems);
    });
  };
  const detach = (attachment: Attachment) => {
    URL.revokeObjectURL(attachment.previewUrl);
    setAttachments((current) => current.filter((a) => a !== attachment));
  };
  const submit = () => {
    const message = draft.trim();
    if (message === "" || chat.busy) return;
    props.assistant.send(message, attachments.map((a) => a.image));
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setDraft("");
    setAttachments([]);
    setProblems([]);
  };
  return (
    <Stack gap="0" flexShrink="0">
      <CommandSuggestions matches={matches} onPick={(c) => setDraft(withCommand(c))} />
      {(attachments.length > 0 || problems.length > 0) && (
        <Stack gap="1" px="3" pt="2" borderTopWidth="1px">
          {attachments.length > 0 && (
            <HStack gap="2" flexWrap="wrap">
              {attachments.map((a) => (
                <Box key={a.previewUrl} position="relative">
                  <chakra.img
                    src={a.previewUrl}
                    alt="Attached image"
                    h="3.5rem"
                    maxW="6rem"
                    objectFit="cover"
                    rounded="l1"
                    borderWidth="1px"
                  />
                  <CloseButton
                    size="2xs"
                    position="absolute"
                    top="-1.5"
                    right="-1.5"
                    bg="bg"
                    rounded="full"
                    aria-label="Remove image"
                    onClick={() => detach(a)}
                  />
                </Box>
              ))}
            </HStack>
          )}
          {problems.map((p) => <Text key={p} fontSize="xs" color="fg.error">{p}</Text>)}
        </Stack>
      )}
      <chakra.form
        display="flex"
        gap="2"
        p="3"
        borderTopWidth={matches.length > 0 || attachments.length > 0 || problems.length > 0
          ? "0"
          : "1px"}
        alignItems="flex-end"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          attach([...e.dataTransfer.files]);
        }}
      >
        <Textarea
          size="sm"
          rows={3}
          resize="none"
          autoresize
          maxH="12rem"
          placeholder={chat.busy
            ? "The assistant is working…"
            : "Ask the assistant… (/ for commands; paste or drop images)"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length === 0) return;
            e.preventDefault();
            attach(files);
          }}
          onKeyDown={(e) => {
            const first = matches.at(0);
            if (e.key === "Tab" && first !== undefined) {
              e.preventDefault();
              setDraft(withCommand(first));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {chat.busy
          ? (
            <Button size="sm" colorPalette="red" variant="subtle" onClick={props.assistant.stop}>
              <LuCircleStop /> Stop
            </Button>
          )
          : (
            <IconButton
              type="submit"
              aria-label="Send"
              title="Send"
              size="sm"
              disabled={draft.trim() === ""}
            >
              <LuSend />
            </IconButton>
          )}
      </chakra.form>
    </Stack>
  );
}

const noCapabilities: Capabilities = { commands: [], models: [] };

export function AssistantPanel(props: { assistant: Assistant; onClose: () => void }) {
  // What Claude Code offers in the repo: read when the window opens (skills may have changed).
  const [capabilities, setCapabilities] = useState(noCapabilities);
  useEffect(() => {
    loadCapabilities().then((r) => {
      if (Either.isRight(r)) setCapabilities(r.right);
    });
  }, []);
  return (
    <Flex direction="column" h="100%" bg="bg" color="fg">
      <Header
        assistant={props.assistant}
        models={capabilities.models}
        onClose={props.onClose}
      />
      {props.assistant.chat.usage !== null && (
        <Text fontSize="xs" color="fg.muted" px="3" py="1" borderBottomWidth="1px" truncate>
          {usageText(props.assistant.chat.usage)}
        </Text>
      )}
      <Transcript chat={props.assistant.chat} assistant={props.assistant} />
      <Composer assistant={props.assistant} commands={capabilities.commands} />
    </Flex>
  );
}
