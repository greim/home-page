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
import { useEffect, useReducer, useRef, useState } from "react";
import { LuCheck, LuDot, LuSend, LuSquarePen, LuTriangleAlert, LuX } from "react-icons/lu";
import type { Layout } from "../common/model.ts";
import { askAssistant } from "./api.ts";
import { type Chat, type ChatEntry, chatReducer, emptyChat } from "./assistant-chat.ts";
import { run } from "./live.ts";
import { columnCorners, surface } from "./surface.ts";

const { gap, adminBarHeight, assistantPanelWidth } = surface;

/** The assistant's conversation, kept while its panel is closed. */
export function useAssistant(onApplied: (layout: Layout) => void) {
  const [chat, dispatch] = useReducer(chatReducer, emptyChat);
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

function Entry(props: { entry: ChatEntry }) {
  const { entry } = props;
  switch (entry.is) {
    case "user":
      return (
        <Box
          alignSelf="flex-end"
          maxW="85%"
          bg="gray.100"
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
        <HStack gap="1.5" fontSize="sm" color="green.700" fontWeight="medium">
          <LuCheck /> Applied to your page
        </HStack>
      );
    case "rejected":
      return (
        <HStack gap="1.5" fontSize="xs" color="orange.700" title={entry.message}>
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

/** A chat with the admin assistant, floating beside the columns below the admin bar. */
export function AssistantPanel(props: {
  chat: Chat;
  onSend: (message: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { chat } = props;
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: Chrome's scrollIntoView returns a promise, which React
    // would take for this effect's cleanup function.
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.entries.length, chat.busy]);

  const submit = () => {
    const message = draft.trim();
    if (message === "" || chat.busy) return;
    props.onSend(message);
    setDraft("");
  };

  return (
    <Theme appearance="light" hasBackground={false}>
      <Flex
        direction="column"
        position="fixed"
        zIndex="4"
        top={`calc(${adminBarHeight} + ${gap})`}
        right={gap}
        w={assistantPanelWidth}
        maxW={`calc(100vw - 2 * ${gap})`}
        h={`min(42rem, calc(100vh - ${adminBarHeight} - 2 * ${gap}))`}
        bg="white"
        color="fg"
        boxShadow={surface.columnShadow}
        overflow="hidden"
        css={columnCorners}
      >
        <HStack px="4" py="2" borderBottomWidth="1px" borderColor="border">
          <Text fontWeight="semibold" flex="1">Assistant</Text>
          <IconButton
            aria-label="New conversation"
            title="New conversation"
            size="xs"
            variant="ghost"
            disabled={chat.busy || chat.entries.length === 0}
            onClick={props.onReset}
          >
            <LuSquarePen />
          </IconButton>
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
        <Stack flex="1" overflowY="auto" px="4" py="3" gap="2.5">
          {chat.entries.length === 0 && (
            <Text fontSize="sm" color="fg.muted">
              Ask me to change your home page, e.g. “add a column of news bookmarks” or “make the
              background darker”. The first few requests may be slow while I learn how your page
              works; I remember what I learn.
            </Text>
          )}
          {chat.entries.map((entry, i) => <Entry key={i} entry={entry} />)}
          {chat.busy && (
            <HStack gap="2" fontSize="sm" color="fg.muted">
              <Spinner size="xs" /> Working…
            </HStack>
          )}
          <div ref={end} />
        </Stack>
        <chakra.form
          display="flex"
          gap="2"
          p="3"
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
            autoFocus
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
          <IconButton
            type="submit"
            aria-label="Send"
            title="Send"
            size="sm"
            alignSelf="flex-end"
            disabled={chat.busy || draft.trim() === ""}
          >
            <LuSend />
          </IconButton>
        </chakra.form>
      </Flex>
    </Theme>
  );
}
