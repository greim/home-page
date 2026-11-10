/**
 * The page configurator's views: a text box and a button in its column, and the
 * full-screen chat where its agent ("configure") changes the layout as the user asks,
 * starting with what they typed in the column (request-live.ts). Each change is
 * listed for the user to apply (through the layout API) or discard.
 */
import { Box, Button, chakra, HStack, Stack, Text, Textarea } from "@chakra-ui/react";
import { Either } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy, LuSend, LuSlidersHorizontal, LuX } from "react-icons/lu";
import { layoutApi } from "../../../common/apis/layout.ts";
import type { Layout } from "../../../common/model.ts";
import { widgetHeading } from "../../surface.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import { useAgentRun } from "../../widget-kit/agent-run.ts";
import { AgentRunPanel } from "../../widget-kit/agent-run-panel.tsx";
import { useWidgetApi } from "../../widget-kit/apis.tsx";
import type { FullScreenProps, WidgetProps } from "../../widget-kit/views.tsx";
import { layoutFileText, readLayout } from "./catalog.ts";
import { ConfiguratorAnswer, type PageConfiguratorConfig } from "./config.ts";
import {
  type Conversation,
  conversationText,
  type Entry,
  inputFor,
  readConversation,
  withAnswer,
  withEntry,
} from "./conversation.ts";
import { describeChanges, newLinks } from "./layout-changes.ts";
import { requestChange, useChangeRequests } from "./request-live.ts";

export function PageConfigurator(
  { config, widgetId, openFullScreen }: WidgetProps<PageConfiguratorConfig>,
) {
  const heading = config.heading.trim();
  const [text, setText] = useState("");
  const go = () => {
    const message = text.trim();
    if (message !== "") requestChange(widgetId, message);
    setText("");
    openFullScreen();
  };
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <TextBox
        mb="0.6rem"
        minH="5rem"
        aria-label="What should change on the page"
        placeholder="What should change? Columns, widgets, bookmarks, colors"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
      />
      <TextBoxButton onClick={go}>
        <LuSlidersHorizontal /> {text.trim() === "" ? "Open the configurator" : "Change the page"}
      </TextBoxButton>
    </>
  );
}

/** A change the agent made, for the user to apply or discard. */
type Pending = {
  readonly base: Layout;
  readonly layout: Layout;
  readonly changes: ReadonlyArray<string>;
  readonly links: ReadonlyArray<string>;
};

const storageKey = (widgetId: string) => `page-configurator:${widgetId}:conversation`;

/** The conversation, kept in this browser (if it can keep it). */
const useConversation = (widgetId: string) => {
  const [conversation, setConversation] = useState<Conversation>(() => {
    try {
      return readConversation(localStorage.getItem(storageKey(widgetId)));
    } catch {
      return readConversation(null);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(widgetId), conversationText(conversation));
    } catch {
      // Not kept: it lasts as long as the view.
    }
  }, [widgetId, conversation]);
  return [conversation, setConversation] as const;
};

function HandOff(props: { message: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box mt="2" borderWidth="1px" rounded="md" p="3" bg="bg.subtle">
      <Text fontSize="sm" fontWeight="medium" mb="1">
        For the assistant, which can change code:
      </Text>
      <Text fontSize="sm" whiteSpace="pre-wrap" mb="2">{props.message}</Text>
      <Button
        size="xs"
        variant="outline"
        onClick={() =>
          void navigator.clipboard.writeText(props.message).then(() => setCopied(true))}
      >
        <LuCopy /> {copied ? "Copied" : "Copy"}
      </Button>
    </Box>
  );
}

function EntryView(props: { entry: Entry }) {
  const { entry } = props;
  switch (entry.is) {
    case "user":
      return (
        <Box alignSelf="end" maxW="80%" bg="bg.emphasized" rounded="lg" px="3" py="2">
          <Text whiteSpace="pre-wrap">{entry.text}</Text>
        </Box>
      );
    case "configurator":
      return (
        <Box maxW="90%">
          <Text whiteSpace="pre-wrap">{entry.text}</Text>
          {entry.handOff !== null && <HandOff message={entry.handOff} />}
        </Box>
      );
    case "page":
      return <Text fontSize="sm" color="fg.muted" textAlign="center">{entry.text}</Text>;
    default:
      return entry satisfies never;
  }
}

function ChangeCard(props: {
  pending: Pending;
  applying: boolean;
  error: string | null;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { pending } = props;
  return (
    <Box borderWidth="1px" borderColor="border.info" bg="bg.info" rounded="md" p="4">
      <Text fontWeight="semibold" mb="2">Changes to your page</Text>
      <Stack as="ul" ps="5" gap="1" fontSize="sm" listStyleType="disc">
        {pending.changes.map((change, i) => <chakra.li key={i}>{change}</chakra.li>)}
      </Stack>
      {pending.links.length > 0 && (
        <>
          <Text fontSize="sm" fontWeight="medium" mt="3" mb="1">Links it added:</Text>
          <Stack gap="0.5" fontSize="sm" fontFamily="mono" wordBreak="break-all">
            {pending.links.map((link) => <Text key={link}>{link}</Text>)}
          </Stack>
        </>
      )}
      {props.error !== null && <Text fontSize="sm" color="fg.error" mt="3">{props.error}</Text>}
      <HStack gap="2" mt="3" justify="end">
        <Button size="sm" variant="outline" disabled={props.applying} onClick={props.onDiscard}>
          <LuX /> Discard
        </Button>
        <Button size="sm" loading={props.applying} onClick={props.onApply}>
          <LuCheck /> Apply
        </Button>
      </HStack>
    </Box>
  );
}

const layoutFile = "layout.json";

export function PageConfiguratorFullScreen({ widgetId }: FullScreenProps<PageConfiguratorConfig>) {
  const layouts = useWidgetApi(layoutApi);
  const run = useAgentRun("configure", ConfiguratorAnswer);
  const [conversation, setConversation] = useConversation(widgetId);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  // The layout the running message's change is made from.
  const base = useRef<Layout | null>(null);
  // The last run view taken in, so each run's end is taken in once.
  const handled = useRef<typeof run.view | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const busy = run.view.is === "starting" || run.view.is === "running";
  const note = useCallback(
    (text: string) => setConversation((c) => withEntry(c, { is: "page", text })),
    [setConversation],
  );

  const send = async (typed: string) => {
    const text = typed.trim();
    if (text === "" || busy || pending !== null) return;
    setMessage("");
    const input = inputFor(conversation, text);
    setConversation((c) => withEntry(c, { is: "user", text }));
    const live = await layouts.get({});
    if (!live.ok) {
      note(`Couldn't read the page's layout: ${live.error.message}`);
      return;
    }
    base.current = live.value;
    await run.start(input, [new File([layoutFileText(live.value)], layoutFile)]);
  };

  // What's typed in the column is sent as soon as the view shows; if it's busy, or has a
  // change waiting, it goes in the message box instead, to send when it can.
  useChangeRequests(widgetId, (text) => {
    if (busy || pending !== null) setMessage(text);
    else void send(text);
  });

  // Takes in each run's end: the answer, and the change it made, if any.
  useEffect(() => {
    const view = run.view;
    if (handled.current === view) return;
    handled.current = view;
    if (view.is === "failed" || view.is === "cancelled") {
      note(view.is === "failed" ? `It didn't finish: ${view.message}` : "Stopped.");
      return;
    }
    if (view.is !== "done") return;
    setConversation((c) => withAnswer(c, view.output));
    const from = base.current;
    if (!view.output.changed || from === null) return;
    if (!view.files.some((f) => f.name === layoutFile)) {
      note(
        "It said it changed the page, but its layout didn't pass the check, so there's nothing to apply.",
      );
      return;
    }
    void run.fileText(view.runId, layoutFile).then((read) => {
      if (!read.ok) {
        note(`Couldn't read its change: ${read.error.message}`);
        return;
      }
      const layout = readLayout(read.value.text);
      if (Either.isLeft(layout)) {
        note(`Couldn't read its change: ${layout.left}`);
        return;
      }
      const changes = describeChanges(from, layout.right);
      if (changes.length === 0) {
        note("Nothing on the page changed.");
        return;
      }
      setApplyError(null);
      setPending({
        base: from,
        layout: layout.right,
        changes,
        links: newLinks(from, layout.right),
      });
    });
  }, [run.view]);

  // A block body: Chrome's scrollIntoView returns a promise, which React would take as a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conversation, pending]);

  const apply = async (change: Pending) => {
    setApplying(true);
    const applied = await layouts.apply({ base: change.base, layout: change.layout });
    setApplying(false);
    if (applied.ok) {
      setPending(null);
      note(`Applied: ${change.changes.join("; ")}.`);
    } else if (applied.error.is === "layout-changed") {
      setPending(null);
      note("Not applied: the page changed while it worked. Ask again to make the change afresh.");
    } else {
      setApplyError(`Couldn't apply it: ${applied.error.message}`);
    }
  };

  const discard = (change: Pending) => {
    setPending(null);
    note(`Discarded: ${change.changes.join("; ")}.`);
  };

  return (
    <Box display="flex" flexDirection="column" h="full" w="full" bg="bg" color="fg">
      <HStack px="5" py="2" borderBottomWidth="1px" justify="end">
        <Button
          size="xs"
          variant="ghost"
          disabled={busy || conversation.entries.length === 0}
          onClick={() => {
            setPending(null);
            setConversation({ entries: [], notes: "" });
          }}
        >
          New conversation
        </Button>
      </HStack>
      <Box flex="1" minH="0" overflowY="auto" px="5" py="4">
        <Stack maxW="48rem" mx="auto" gap="4">
          {conversation.entries.length === 0 && (
            <Text color="fg.muted" fontSize="sm">
              Ask for changes to your page: "add a column of news sites", "make the Music column
              blue", "my day ends at 6". It edits only the page's layout, and lists each change for
              you to apply. It asks before searching the web or reading a page. For new kinds of
              widget, or changes to how one works, it'll suggest what to ask the assistant.
            </Text>
          )}
          {conversation.entries.map((entry, i) => <EntryView key={i} entry={entry} />)}
          {busy && (
            <AgentRunPanel
              view={run.view}
              onAnswer={run.answer}
              onCancel={run.cancel}
              fileUrl={run.fileUrl}
            />
          )}
          {pending !== null && (
            <ChangeCard
              pending={pending}
              applying={applying}
              error={applyError}
              onApply={() => void apply(pending)}
              onDiscard={() => discard(pending)}
            />
          )}
          <div ref={bottom} />
        </Stack>
      </Box>
      <Box borderTopWidth="1px" px="5" py="3">
        <HStack maxW="48rem" mx="auto" gap="2" align="end">
          <Textarea
            rows={2}
            autoresize
            placeholder={pending === null
              ? "What should change? (Enter sends, Shift+Enter for a new line)"
              : "Apply or discard the change first"}
            disabled={pending !== null}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(message);
              }
            }}
          />
          <Button
            disabled={message.trim() === "" || busy || pending !== null}
            loading={busy}
            onClick={() => void send(message)}
          >
            <LuSend /> Send
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}
