import { Badge, Box, Center, Spinner, Text } from "@chakra-ui/react";
import { Effect, Either } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type LayoutAction } from "../common/layout-ops.ts";
import { defaultSchedule } from "../common/day-cycle.ts";
import type { Layout } from "../common/model.ts";
import { AdminBar } from "./admin-bar.tsx";
import { Http, loadLayout, saveLayout } from "./api.ts";
import { adminModeKey, type Board, BoardContext, type EditRequest } from "./board-context.ts";
import { ColumnStrip } from "./column-strip.tsx";
import { HttpLive, run } from "./live.ts";
import { useDayPhase } from "./use-day-phase.ts";
import { dayPreviewAvailable, nextNightView, type NightView, showsNight } from "./night-mode.ts";
import { night as nightStyle } from "./surface.ts";
import { makeSaveQueue } from "./save-queue.ts";
import { ColumnEditor } from "./column-editor.tsx";
import { SettingsDialog } from "./settings-dialog.tsx";
import { AssistantPanel } from "./assistant/assistant-panel.tsx";
import {
  AssistantWindow,
  ReopenAssistant,
  useAssistantWindow,
  type WindowState,
} from "./assistant/assistant-window.tsx";
import { makeConversations } from "./assistant/conversations.ts";
import { browserChatStorage, makeUseAssistant } from "./assistant/use-assistant.ts";

/** The assistant window's conversation, kept as long as the page. */
const windowConversations = makeConversations(browserChatStorage);
const windowConversationId = "window";

/**
 * The assistant window's conversation and, while it's open, the window. Always
 * mounted, so a turn carries on (and applies its layout) while the window is closed.
 * Its own component, so streamed text re-renders it rather than the whole page.
 */
function AssistantHost(props: {
  window: WindowState;
  onClose: () => void;
  onApplied: (layout: Layout) => void;
}) {
  const { onApplied } = props;
  const useAssistant = useMemo(() => makeUseAssistant(windowConversations, onApplied), [onApplied]);
  const assistant = useAssistant(windowConversationId);
  return (
    <AssistantWindow state={props.window}>
      <AssistantPanel
        assistant={assistant}
        // A PiP window has the browser's own close button; the in-page panel doesn't.
        onClose={props.window.is === "panel" ? props.onClose : null}
      />
    </AssistantWindow>
  );
}

type LoadState =
  | { is: "loading" }
  | { is: "failed"; message: string }
  | { is: "ready"; layout: Layout };

/** Toggles admin mode when F2 is pressed; also returns a way to exit it. */
function useAdminMode(suspended: boolean): [admin: boolean, exit: () => void] {
  const [admin, setAdmin] = useState(false);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== adminModeKey || event.repeat || suspendedRef.current) return;
      event.preventDefault();
      setAdmin((a) => !a);
    };
    globalThis.addEventListener("keydown", listener);
    return () => globalThis.removeEventListener("keydown", listener);
  }, []);
  const exit = useCallback(() => setAdmin(false), []);
  return [admin, exit];
}

export function App() {
  const [state, setState] = useState<LoadState>({ is: "loading" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditRequest | null>(null);
  // The column being edited, while it still exists (the assistant may remove it).
  const editingColumn = state.is === "ready" && editing !== null
    ? state.layout.columns.find((c) => c.id === editing.columnId)
    : undefined;
  const [admin, exitAdmin] = useAdminMode(editingColumn !== undefined);

  useEffect(() => {
    run(loadLayout).then((result) =>
      setState(
        Either.isRight(result)
          ? { is: "ready", layout: result.right }
          : { is: "failed", message: result.left.message },
      )
    );
  }, []);

  const queue = useMemo(
    () =>
      makeSaveQueue(
        (layout: Layout) => Effect.provideService(saveLayout(layout), Http, HttpLive),
        (result) => setSaveError(result.ok ? null : result.error.message),
      ),
    [],
  );

  // Persist every change after the initial load.
  const loaded = useRef<Layout | null>(null);
  useEffect(() => {
    if (state.is !== "ready") return;
    if (loaded.current === null) {
      loaded.current = state.layout;
      return;
    }
    queue.save(state.layout);
  }, [state, queue]);

  // Columns added since admin mode was entered. Leaving admin mode discards
  // any still untouched (default heading, no widgets).
  const addedColumnIds = useRef<ReadonlyArray<string>>([]);

  const dispatch = useCallback((action: LayoutAction) => {
    if (action.is === "add-column") {
      addedColumnIds.current = [...addedColumnIds.current, action.column.id];
    }
    setState((s) => s.is === "ready" ? { ...s, layout: applyAction(s.layout, action) } : s);
  }, []);

  useEffect(() => {
    // Entering admin mode starts afresh, so columns added outside it are kept.
    if (!admin && addedColumnIds.current.length > 0) {
      dispatch({ is: "discard-untouched-columns", columnIds: addedColumnIds.current });
    }
    addedColumnIds.current = [];
  }, [admin, dispatch]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const assistantWindow = useAssistantWindow();
  const onApplied = useCallback(
    (layout: Layout) => dispatch({ is: "replace-layout", layout }),
    [dispatch],
  );

  const schedule = state.is === "ready" ? state.layout.schedule : defaultSchedule;
  const phase = useDayPhase(schedule);
  // Previewing daytime at night, to see and edit column colors. It lasts only
  // while admin mode does, so admin mode always starts without it.
  const [dayPreview, setDayPreview] = useState(false);
  useEffect(() => {
    if (!admin) setDayPreview(false);
  }, [admin]);
  const night = showsNight(phase, admin, dayPreview);
  // Whether the last change between day and night was the user's, to show it quickly.
  const [nightView, setNightView] = useState<NightView>({ night, phase, quick: false });
  if (night !== nightView.night || phase !== nightView.phase) {
    setNightView(nextNightView(nightView, { night, phase }));
  }
  const nightPace = nightView.quick ? nightStyle.quickTransition : nightStyle.transition;
  const board: Board = useMemo(
    () => ({ admin, dispatch, edit: setEditing, schedule, night, nightPace }),
    [admin, dispatch, schedule, night, nightPace],
  );

  switch (state.is) {
    case "loading":
      return (
        <Center h="100vh">
          <Spinner />
        </Center>
      );
    case "failed":
      return (
        <Center h="100vh">
          <Text color="fg.error">Couldn't load your home page: {state.message}</Text>
        </Center>
      );
    case "ready":
      break;
    default:
      return state satisfies never;
  }

  return (
    <BoardContext.Provider value={board}>
      <ColumnStrip
        columns={state.layout.columns}
        adminBar={
          <AdminBar
            shown={admin}
            message={`Admin mode · press ${adminModeKey} to exit`}
            onExit={exitAdmin}
            dayPreview={{
              available: dayPreviewAvailable(phase),
              on: admin && dayPreview,
              onToggle: () => setDayPreview((on) => !on),
            }}
            onSettings={() => setSettingsOpen(true)}
            onAssistant={assistantWindow.open}
          />
        }
      />
      {editing !== null && editingColumn !== undefined && (
        <ColumnEditor
          column={editingColumn}
          columns={state.layout.columns}
          widgetId={editing.widgetId}
          onClose={() => setEditing(null)}
          onSave={(action) => {
            dispatch(action);
            setEditing(null);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          schedule={schedule}
          onClose={() => setSettingsOpen(false)}
          onSave={(action) => {
            dispatch(action);
            setSettingsOpen(false);
          }}
        />
      )}
      <AssistantHost
        window={assistantWindow.state}
        onClose={assistantWindow.close}
        onApplied={onApplied}
      />
      {assistantWindow.reopen && (
        <ReopenAssistant
          onOpen={assistantWindow.open}
          onDismiss={assistantWindow.dismissReopen}
        />
      )}
      {saveError !== null && (
        <Box position="fixed" bottom="3" left="50%" transform="translateX(-50%)" zIndex="3">
          <Badge colorPalette="red" size="lg" title={saveError}>Couldn't save changes</Badge>
        </Box>
      )}
    </BoardContext.Provider>
  );
}
