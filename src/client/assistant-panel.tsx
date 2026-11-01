import {
  Box,
  chakra,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Stack,
  Text,
  Textarea,
  Theme,
} from "@chakra-ui/react";
import { Either } from "effect";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { LuCheck, LuDot, LuSend, LuSquarePen, LuTriangleAlert, LuX } from "react-icons/lu";
import type { Layout } from "../common/model.ts";
import { askAssistant } from "./api.ts";
import { type Chat, type ChatEntry, chatReducer, restoreChat, saveChat } from "./assistant-chat.ts";
import { run } from "./live.ts";
import { columnCorners, surface } from "./surface.ts";

const { gap, adminBarHeight, assistantPanelWidth, assistantWidgetHeight } = surface;

const storageKey = "home-page.assistant-chat";

/** Reads the saved conversation; storage can be unavailable (e.g. private windows). */
const loadChat = (): Chat => {
  try {
    return restoreChat(localStorage.getItem(storageKey));
  } catch {
    return restoreChat(null);
  }
};

/** The assistant's conversation, kept while its panel is closed and across reloads. */
export function useAssistant(onApplied: (layout: Layout) => void) {
  const [chat, dispatch] = useReducer(chatReducer, undefined, loadChat);
  useEffect(() => {
    try {
      if (chat.entries.length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, saveChat(chat));
    } catch {
      // Not saved: the conversation still works, it just won't survive a reload.
    }
  }, [chat]);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const send = (message: string) => {
    dispatch({ is: "send", text: message });
    run(askAssistant({ message, sessionId: chat.sessionId }, (event) => {
      dispatch({ is: "event", event });
      if (event.is === "applied") onAppliedRef.current(event.layout);
    })).then((result) =>
      dispatch(
        Either.isLeft(result) ? { is: "failed", message: result.left.message } : { is: "finished" },
      )
    );
  };

  return { chat, send, reset: () => dispatch({ is: "reset" }) };
}

export type Assistant = ReturnType<typeof useAssistant>;

/** The one conversation, shared by the admin bar's panel and any assistant widgets. */
export const AssistantContext = createContext<Assistant | null>(null);

function Entry(props: { entry: ChatEntry }) {
  const { entry } = props;
  switch (entry.is) {
    case "user":
      return (
        <Box
          alignSelf="flex-end"
          maxW="85%"
          bg="bg.muted"
          px="3"
          py="2"
          rounded="lg"
          fontSize="sm"
          whiteSpace="pre-wrap"
        >
          {entry.text}
        </Box>
      );
    case "assistant":
      return <Text fontSize="sm" whiteSpace="pre-wrap">{entry.text}</Text>;
    case "activity":
      return (
        <HStack gap="1" fontSize="xs" color="fg.muted" title={entry.label}>
          <LuDot />
          <Text truncate>{entry.label}</Text>
        </HStack>
      );
    case "applied":
      return (
        <HStack gap="1.5" fontSize="sm" color="fg.success" fontWeight="medium">
          <LuCheck /> Applied to your page
        </HStack>
      );
    case "rejected":
      return (
        <HStack gap="1.5" fontSize="xs" color="fg.warning" title={entry.message}>
          <LuTriangleAlert />
          <Text truncate>Change rejected, retrying: {entry.message}</Text>
        </HStack>
      );
    case "error":
      return <Text fontSize="sm" color="fg.error" whiteSpace="pre-wrap">{entry.message}</Text>;
    case "summary":
      return <Text fontSize="xs" color="fg.subtle" textAlign="right">{entry.text}</Text>;
    default:
      return entry satisfies never;
  }
}

/** The conversation so far, kept scrolled to its latest message. */
function ChatMessages(props: { chat: Chat; px: string }) {
  const { chat } = props;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Not scrollIntoView: in a widget, that would scroll the column too.
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [chat.entries.length, chat.busy]);

  return (
    <Stack ref={scroller} flex="1" minH="0" overflowY="auto" px={props.px} py="3" gap="2.5">
      {chat.entries.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          Ask me to change your home page, e.g. “add a column of news bookmarks” or “make the
          background darker”. The first few requests may be slow while I learn how your page works;
          I remember what I learn.
        </Text>
      )}
      {chat.entries.map((entry, i) => <Entry key={i} entry={entry} />)}
      {chat.busy && (
        <HStack gap="2" fontSize="sm" color="fg.muted">
          <Spinner size="xs" /> Working…
        </HStack>
      )}
    </Stack>
  );
}

/** Where the user types. `actions` go above the send button. Inset pads it on all sides. */
function ChatComposer(props: {
  chat: Chat;
  onSend: (message: string) => void;
  autoFocus: boolean;
  inset: boolean;
  actions?: ReactNode;
}) {
  const { chat } = props;
  const [draft, setDraft] = useState("");

  const submit = () => {
    const message = draft.trim();
    if (message === "" || chat.busy) return;
    props.onSend(message);
    setDraft("");
  };

  return (
    <chakra.form
      display="flex"
      gap="2"
      {...(props.inset ? { p: "3" } : { pt: "3" })}
      borderTopWidth="1px"
      borderColor="border"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        size="sm"
        rows={2}
        resize="none"
        autoFocus={props.autoFocus}
        placeholder="Ask the assistant…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Stack gap="1" justify="flex-end">
        {props.actions}
        <IconButton
          type="submit"
          aria-label="Send"
          title="Send"
          size="sm"
          disabled={chat.busy || draft.trim() === ""}
        >
          <LuSend />
        </IconButton>
      </Stack>
    </chakra.form>
  );
}

function NewConversationButton(props: { chat: Chat; onReset: () => void; size: "xs" | "sm" }) {
  return (
    <IconButton
      aria-label="New conversation"
      title="New conversation"
      size={props.size}
      variant="ghost"
      disabled={props.chat.busy || props.chat.entries.length === 0}
      onClick={props.onReset}
    >
      <LuSquarePen />
    </IconButton>
  );
}

/** A chat with the admin assistant, floating over the columns in the middle of the viewport. */
export function AssistantPanel(props: {
  chat: Chat;
  onSend: (message: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { chat } = props;
  return (
    <Theme appearance="light" hasBackground={false}>
      <Flex
        direction="column"
        position="fixed"
        zIndex="4"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        w={assistantPanelWidth}
        maxW={`calc(100vw - 2 * ${gap})`}
        // Centered, so leaving room for the admin bar at the top means leaving
        // the same room at the bottom.
        h={`min(42rem, calc(100vh - 2 * (${adminBarHeight} + ${gap})))`}
        bg="white"
        color="fg"
        boxShadow={surface.columnShadow}
        overflow="hidden"
        css={columnCorners}
      >
        <HStack px="4" py="2" borderBottomWidth="1px" borderColor="border">
          <Text fontWeight="semibold" flex="1">Assistant</Text>
          <NewConversationButton chat={chat} onReset={props.onReset} size="xs" />
          <IconButton
            aria-label="Close"
            title="Close"
            size="xs"
            variant="ghost"
            onClick={props.onClose}
          >
            <LuX />
          </IconButton>
        </HStack>
        <ChatMessages chat={chat} px="4" />
        <ChatComposer chat={chat} onSend={props.onSend} autoFocus inset />
      </Flex>
    </Theme>
  );
}

/**
 * The assistant pinned into a column: the same conversation as the panel,
 * sized to sit among the other widgets and colored to suit its column.
 */
export function AssistantWidget() {
  const assistant = useContext(AssistantContext);
  if (assistant === null) throw new Error("AssistantWidget must be used within AssistantContext");
  const { chat } = assistant;
  return (
    <Flex direction="column" h={assistantWidgetHeight}>
      <ChatMessages chat={chat} px="0" />
      <ChatComposer
        chat={chat}
        onSend={assistant.send}
        autoFocus={false}
        inset={false}
        actions={<NewConversationButton chat={chat} onReset={assistant.reset} size="sm" />}
      />
    </Flex>
  );
}
