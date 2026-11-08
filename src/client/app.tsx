import { Badge, Box, Center, Spinner, Text } from "@chakra-ui/react";
import { Effect, Either } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type LayoutAction } from "../common/layout-ops.ts";
import { defaultSchedule } from "../common/day-cycle.ts";
import type { Layout } from "../common/model.ts";
import { AdminBar } from "./admin-bar.tsx";
import { Http, loadLayout, saveLayout } from "./api.ts";
import { adminModeKey, type Board, BoardContext } from "./board-context.ts";
import { ColumnStrip } from "./column-strip.tsx";
import { HttpLive, run } from "./live.ts";
import { useDayPhase } from "./use-day-phase.ts";
import { dayPreviewAvailable, nextNightView, type NightView, showsNight } from "./night-mode.ts";
import { night as nightStyle } from "./surface.ts";
import { makeSaveQueue } from "./save-queue.ts";
import { ColumnEditor, columnEditorTitle } from "./column-editor.tsx";
import { SettingsDialog, settingsTitle } from "./settings-dialog.tsx";
import { AssistantProvider, ConnectedAssistantPanel } from "./assistant/assistant-context.tsx";
import {
  FullScreenHost,
  type FullScreenView,
  useFullScreen,
  type ViewContent,
} from "./full-screen/full-screen-host.tsx";
import { WidgetFullScreen } from "./widget-card.tsx";
import { widgetLabel } from "./widget-draft.ts";
import { registeredTypes, useWidgetHost } from "./widget-host.tsx";

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
  const fullScreen = useFullScreen(state.is === "ready" ? state.layout : null);
  // While a modal is open, the page beneath it is out of reach, admin mode included.
  const [admin, exitAdmin] = useAdminMode(fullScreen.state.modal !== null);
  const { registry } = useWidgetHost();

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
    () => ({ admin, dispatch, open: fullScreen.open, schedule, night, nightPace }),
    [admin, dispatch, fullScreen.open, schedule, night, nightPace],
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

  const { layout } = state;

  /** What each full-screen view shows; null for one whose column or widget is gone. */
  const renderView = (view: FullScreenView): ViewContent | null => {
    const close = () => fullScreen.close(view);
    const saveAndClose = (action: LayoutAction) => {
      dispatch(action);
      close();
    };
    switch (view.is) {
      case "assistant":
        return {
          title: "Assistant",
          width: "36rem",
          fullHeight: true,
          content: <ConnectedAssistantPanel />,
        };
      case "settings":
        return {
          title: settingsTitle,
          width: "28rem",
          fullHeight: false,
          content: <SettingsDialog schedule={schedule} onClose={close} onSave={saveAndClose} />,
        };
      case "column-editor": {
        const column = layout.columns.find((c) => c.id === view.columnId);
        if (column === undefined) return null;
        return {
          title: columnEditorTitle,
          width: "72rem",
          fullHeight: true,
          content: (
            <ColumnEditor
              column={column}
              columns={layout.columns}
              widgetId={view.widgetId}
              onClose={close}
              onSave={saveAndClose}
            />
          ),
        };
      }
      case "widget": {
        const column = layout.columns.find((c) => c.widgets.some((w) => w.id === view.widgetId));
        const widget = column?.widgets.find((w) => w.id === view.widgetId);
        if (column === undefined || widget === undefined) return null;
        return {
          title: widgetLabel(widget, registeredTypes(registry)),
          width: "full",
          fullHeight: true,
          content: (
            <Box flex="1" minH="0" overflow="auto">
              <WidgetFullScreen columnId={column.id} widget={widget} />
            </Box>
          ),
        };
      }
      default:
        return view satisfies never;
    }
  };

  return (
    <BoardContext.Provider value={board}>
      <AssistantProvider onApplied={onApplied}>
        <ColumnStrip
          columns={layout.columns}
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
              onSettings={() => fullScreen.open({ is: "settings" })}
              onAssistant={() => fullScreen.open({ is: "assistant" })}
            />
          }
        />
        <FullScreenHost fullScreen={fullScreen} render={renderView} />
      </AssistantProvider>
      {saveError !== null && (
        <Box position="fixed" bottom="3" left="50%" transform="translateX(-50%)" zIndex="3">
          <Badge colorPalette="red" size="lg" title={saveError}>Couldn't save changes</Badge>
        </Box>
      )}
    </BoardContext.Provider>
  );
}
