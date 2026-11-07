/** The assistant widget's view: a chat with the admin assistant, in a column. */
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
} from "@chakra-ui/react";
import { Effect, Either } from "effect";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LuCheck, LuDot, LuSend, LuSquarePen, LuTriangleAlert } from "react-icons/lu";
import type { Layout } from "../../../common/model.ts";
import { askAssistant } from "../../api.ts";
import { captureScreenshot, run } from "../../live.ts";
import { screenshotRootId } from "../../screenshot.ts";
import { hiddenScrollbar, surface } from "../../surface.ts";
import { type Chat, type ChatEntry, restoreChat, saveChat } from "./chat.ts";
import type { ChatStorage, Conversations } from "./conversations.ts";

const { assistantWidgetHeight } = surface;

/** Browser storage for conversations. It can be unavailable (e.g. private windows). */
export const browserChatStorage: ChatStorage = {
  load: (key) => {
    try {
      return restoreChat(localStorage.getItem(key));
    } catch {
      return restoreChat(null);
    }
  },
  save: (key, chat) => {
    try {
      if (chat.entries.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, saveChat(chat));
    } catch {
      // Not saved: the conversation still works, it just won't survive a reload.
    }
  },
};

/** The page as the user sees it, for the agent to look at; null if that fails. */
const screenshot = () => {
  const surface = document.getElementById(screenshotRootId);
  return Effect.runPromise(
    surface === null ? Effect.succeed(null) : captureScreenshot(surface).pipe(
      Effect.tapError((e) => Effect.sync(() => console.warn("Couldn't take a screenshot:", e))),
      Effect.orElseSucceed(() => null),
    ),
  );
};

export type Assistant = {
  readonly chat: Chat;
  readonly send: (message: string) => void;
  readonly reset: () => void;
};

/**
 * A hook for an assistant widget's conversation, by the widget's id. `onApplied` hears about each
 * layout the assistant applies, so the page can show it.
 */
export const makeUseAssistant = (
  conversations: Conversations,
  onApplied: (layout: Layout) => void,
) =>
(widgetId: string): Assistant => {
  const chat = useSyncExternalStore(conversations.subscribe, () => conversations.get(widgetId));
  const dispatch = (action: Parameters<Conversations["dispatch"]>[1]) =>
    conversations.dispatch(widgetId, action);
  const send = (message: string) => {
    dispatch({ is: "send", text: message });
    screenshot().then((screenshot) =>
      run(askAssistant({ message, sessionId: chat.sessionId, screenshot }, (event) => {
        dispatch({ is: "event", event });
        if (event.is === "applied") onApplied(event.layout);
      }))
    ).then((result) =>
      dispatch(
        Either.isLeft(result) ? { is: "failed", message: result.left.message } : { is: "finished" },
      )
    );
  };
  return { chat, send, reset: () => dispatch({ is: "reset" }) };
};

function Entry(props: { entry: ChatEntry }) {
  const { entry } = props;
  switch (entry.is) {
    case "user":
      return (
        // A darker wash than the history box it sits in, with the same corner radius.
        <Box
          alignSelf="flex-end"
          maxW="85%"
          bg="black/20"
          px="3"
          py="2"
          rounded="l2"
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
      return <Text fontSize="xs" color="fg/60" textAlign="right">{entry.text}</Text>;
    default:
      return entry satisfies never;
  }
}

/**
 * A thin border in the column's own text color, made translucent, so it adapts
 * to light and dark columns like the text does (Chakra's `border` is a fixed gray).
 */
const widgetBorder = { borderWidth: "1px", borderColor: "fg/20" } as const;

/** The chat history: a faint white wash. */
const messagesStyle = {
  bg: "white/20",
  padding: "0.7em 0.9em",
  // The same radius Chakra's textarea recipe gives the prompt field below.
  borderRadius: "l2",
  boxShadow: surface.chatInsetShadow,
  ...widgetBorder,
} as const;

/**
 * Scales the rem-based `xs` and `sm` font sizes to 90% inside the history
 * (entries size their text with Chakra's tokens, so a percentage font-size here
 * wouldn't reach them; scaling the tokens' variables does), and makes muted text the column's own text color at 80%: Chakra's `fg.muted` is a
 * fixed gray, which looks washed out in a column.
 */
const fontScale = {
  "--chakra-font-sizes-xs": "calc(0.75rem * 0.9)",
  "--chakra-font-sizes-sm": "calc(0.875rem * 0.9)",
  "--chakra-colors-fg-muted": "color-mix(in srgb, var(--chakra-colors-fg) 80%, transparent)",
} as const;

/** The conversation so far, kept scrolled to its latest message. */
function ChatMessages(props: { chat: Chat }) {
  const { chat } = props;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Not scrollIntoView: that would scroll the column too.
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [chat.entries.length, chat.busy]);

  return (
    <Stack
      ref={scroller}
      flex="1"
      minH="0"
      overflowY="auto"
      py="3"
      gap="2.5"
      css={{ ...hiddenScrollbar, ...fontScale }}
      {...messagesStyle}
    >
      {chat.entries.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          Ask me to change your home page, e.g. “add a column of news bookmarks” or “my day starts
          at 8”. I can also write new kinds of widget, e.g. “a widget that shows the weather”.
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

/**
 * Where the user types: a white field, half-faded until focused so it sits
 * quietly in a column. `actions` go above the send button.
 */
function ChatComposer(props: {
  chat: Chat;
  onSend: (message: string) => void;
  actions: ReactNode;
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
      pt="3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        size="sm"
        rows={2}
        resize="none"
        bg="white"
        // Black on the white field, whatever color the column's own text is, and
        // without the shadow that lifts white text off the column.
        color="black"
        textShadow="none"
        _placeholder={{ color: "gray.500" }}
        boxShadow={surface.faintInsetShadow}
        // Twice as strong: the field's 50% opacity fades its border too, and
        // this keeps it level with the chat history's while unfocused.
        borderWidth="1px"
        borderColor="fg/40"
        // Keep the focus ring's border color, which the line above would override.
        _focusVisible={{ borderColor: "var(--focus-ring-color)" }}
        opacity={0.5}
        _focus={{ opacity: 1 }}
        transition="opacity 0.15s"
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

function NewConversationButton(props: { chat: Chat; onReset: () => void }) {
  return (
    <IconButton
      aria-label="New conversation"
      title="New conversation"
      size="sm"
      variant="ghost"
      disabled={props.chat.busy || props.chat.entries.length === 0}
      onClick={props.onReset}
    >
      <LuSquarePen />
    </IconButton>
  );
}

/**
 * The assistant in a column: a conversation of its own, sized to sit among the
 * other widgets and colored to suit its column.
 */
export function AssistantWidget(props: { assistant: Assistant }) {
  const { assistant } = props;
  const { chat } = assistant;
  return (
    <Flex direction="column" h={assistantWidgetHeight}>
      <ChatMessages chat={chat} />
      <ChatComposer
        chat={chat}
        onSend={assistant.send}
        actions={<NewConversationButton chat={chat} onReset={assistant.reset} />}
      />
    </Flex>
  );
}
