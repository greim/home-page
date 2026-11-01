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
import { Effect, Either } from "effect";
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
import {
  type Chat,
  type ChatAction,
  type ChatEntry,
  chatReducer,
  restoreChat,
  saveChat,
} from "./assistant-chat.ts";
import { captureScreenshot, run } from "./live.ts";
import { screenshotRootId } from "./screenshot.ts";
import { columnCorners, hiddenScrollbar, surface } from "./surface.ts";

const { gap, adminBarHeight, assistantPanelWidth, assistantWidgetHeight } = surface;

/** Where each conversation is kept in browser storage. */
const storagePrefix = "home-page.assistant-chat";

/** Which conversation: the admin bar's panel, or the assistant widget with this id. */
export type ChatHost = { is: "panel" } | { is: "widget"; widgetId: string };

const storageKey = (host: ChatHost) =>
  host.is === "panel" ? storagePrefix : `${storagePrefix}.widget.${host.widgetId}`;

/** Reads a saved conversation; storage can be unavailable (e.g. private windows). */
const loadChat = (key: string): Chat => {
  try {
    return restoreChat(localStorage.getItem(key));
  } catch {
    return restoreChat(null);
  }
};

const storeChat = (key: string, chat: Chat) => {
  try {
    if (chat.entries.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, saveChat(chat));
  } catch {
    // Not saved: the conversation still works, it just won't survive a reload.
  }
};

type Chats = Readonly<Record<string, Chat>>;

const chatsReducer = (
  chats: Chats,
  action: { key: string; base: Chat; action: ChatAction },
): Chats => ({
  ...chats,
  [action.key]: chatReducer(chats[action.key] ?? action.base, action.action),
});

/**
 * The assistant's conversations, one per place it's hosted (the admin bar's
 * panel and each assistant widget), kept here rather than in their hosts so a
 * turn carries on while its panel is closed or its widget collapsed, and saved
 * so they survive reloads.
 */
export function useAssistants(onApplied: (layout: Layout) => void) {
  const [chats, dispatchChat] = useReducer(chatsReducer, {});
  // Conversations read from storage but not yet touched, read once each.
  const loaded = useRef(new Map<string, Chat>());
  const chatAt = (key: string): Chat => {
    const live = chats[key];
    if (live !== undefined) return live;
    let saved = loaded.current.get(key);
    if (saved === undefined) {
      saved = loadChat(key);
      loaded.current.set(key, saved);
    }
    return saved;
  };
  const stored = useRef<Chats>({});
  useEffect(() => {
    for (const [key, chat] of Object.entries(chats)) {
      if (stored.current[key] !== chat) storeChat(key, chat);
    }
    stored.current = chats;
  }, [chats]);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

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

  /** The conversation hosted at `host`. */
  return (host: ChatHost) => {
    const key = storageKey(host);
    const chat = chatAt(key);
    const dispatch = (action: ChatAction) => dispatchChat({ key, base: chat, action });
    const send = (message: string) => {
      dispatch({ is: "send", text: message });
      screenshot().then((screenshot) =>
        run(askAssistant({ message, sessionId: chat.sessionId, screenshot }, (event) => {
          dispatch({ is: "event", event });
          if (event.is === "applied") onAppliedRef.current(event.layout);
        }))
      ).then((result) =>
        dispatch(
          Either.isLeft(result)
            ? { is: "failed", message: result.left.message }
            : { is: "finished" },
        )
      );
    };
    return { chat, send, reset: () => dispatch({ is: "reset" }) };
  };
}

export type Assistants = ReturnType<typeof useAssistants>;
export type Assistant = ReturnType<Assistants>;

/** Every conversation, for the admin bar's panel and any assistant widgets to find their own. */
export const AssistantContext = createContext<Assistants | null>(null);

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

/**
 * The widget's chat history: a faint white wash, with text at 80% of its usual
 * size. Entries size their text with Chakra's rem-based tokens, so a percentage
 * font-size here wouldn't reach them; scaling the tokens' variables does.
 */
const widgetMessagesStyle = {
  bg: "white/10",
  padding: "1em 1.2em",
  // The same radius Chakra's textarea recipe gives the prompt field below.
  borderRadius: "l2",
  boxShadow: surface.faintInsetShadow,
  ...widgetBorder,
} as const;

/** Scales the rem-based `xs` and `sm` font sizes to 80% inside the widget's history. */
const widgetFontScale = {
  "--chakra-font-sizes-xs": "calc(0.75rem * 0.8)",
  "--chakra-font-sizes-sm": "calc(0.875rem * 0.8)",
} as const;

/** The conversation so far, kept scrolled to its latest message. */
function ChatMessages(props: { chat: Chat; px: string; compact?: boolean }) {
  const { chat } = props;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Not scrollIntoView: in a widget, that would scroll the column too.
    const el = scroller.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [chat.entries.length, chat.busy]);

  return (
    <Stack
      ref={scroller}
      flex="1"
      minH="0"
      overflowY="auto"
      px={props.px}
      py="3"
      gap="2.5"
      css={{ ...hiddenScrollbar, ...(props.compact ? widgetFontScale : {}) }}
      {...(props.compact ? widgetMessagesStyle : {})}
    >
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
  /** Half-faded on a white field until focused, so it sits quietly in a column. */
  fadeUntilFocused?: boolean;
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
      {
        // Inset (the panel), a rule divides it from the messages; in the widget,
        // the history's own background does that.
        ...(props.inset ? { p: "3", borderTopWidth: "1px", borderColor: "border" } : { pt: "3" })
      }
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        size="sm"
        rows={2}
        resize="none"
        {...(props.fadeUntilFocused
          ? {
            bg: "white",
            // Black on the white field, whatever color the column's own text is.
            color: "black",
            _placeholder: { color: "gray.500" },
            boxShadow: surface.faintInsetShadow,
            // Twice as strong: the field's 50% opacity fades its border too, and
            // this keeps it level with the chat history's while unfocused.
            borderWidth: "1px",
            borderColor: "fg/40",
            // Keep the focus ring's border color, which the line above would override.
            _focusVisible: { borderColor: "var(--focus-ring-color)" },
            opacity: 0.5,
            _focus: { opacity: 1 },
            transition: "opacity 0.15s",
          }
          : {})}
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
 * The assistant pinned into a column: a conversation of its own, separate from
 * the panel's, sized to sit among the other widgets and colored to suit its column.
 */
export function AssistantWidget(props: { widgetId: string }) {
  const assistants = useContext(AssistantContext);
  if (assistants === null) throw new Error("AssistantWidget must be used within AssistantContext");
  const assistant = assistants({ is: "widget", widgetId: props.widgetId });
  const { chat } = assistant;
  return (
    <Flex direction="column" h={assistantWidgetHeight}>
      <ChatMessages chat={chat} px="0" compact />
      <ChatComposer
        chat={chat}
        onSend={assistant.send}
        autoFocus={false}
        inset={false}
        fadeUntilFocused
        actions={<NewConversationButton chat={chat} onReset={assistant.reset} size="sm" />}
      />
    </Flex>
  );
}
