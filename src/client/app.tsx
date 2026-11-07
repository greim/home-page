import { Badge, Box, Center, Spinner, Text } from "@chakra-ui/react";
import { Effect, Either, Schema } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type LayoutAction } from "../common/layout-ops.ts";
import { defaultSchedule } from "../common/day-cycle.ts";
import { Layout } from "../common/model.ts";
import { AdminBar } from "./admin-bar.tsx";
import { Http, loadLayout, saveLayout } from "./api.ts";
import { adminModeKey, type Board, BoardContext, type EditRequest } from "./board-context.ts";
import { ColumnStrip } from "./column-strip.tsx";
import { HttpLive, run } from "./live.ts";
import { useDayPhase } from "./use-day-phase.ts";
import { makeSaveQueue } from "./save-queue.ts";
import { ColumnEditor } from "./column-editor.tsx";
import { useWidgetHost } from "./widget-host.tsx";
import { layoutAppliedChannel } from "./widgets/assistant/protocol.ts";

/** The widget type that provides the assistant, which applies layouts itself. */
const assistantType = "assistant";

const decodeLayout = Schema.decodeUnknownEither(Layout);

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

  // The assistant applies layouts from its own bundle, and tells the page here.
  const { manager } = useWidgetHost();
  useEffect(
    () =>
      manager.receive(assistantType, layoutAppliedChannel, (message) => {
        const layout = decodeLayout(message);
        if (Either.isLeft(layout)) {
          throw new Error(`The assistant applied an invalid layout: ${layout.left.message}`);
        }
        dispatch({ is: "replace-layout", layout: layout.right });
        return null;
      }),
    [manager, dispatch],
  );

  const schedule = state.is === "ready" ? state.layout.schedule : defaultSchedule;
  const phase = useDayPhase(schedule);
  const night = phase === "night";
  const board: Board = useMemo(
    () => ({ admin, dispatch, edit: setEditing, schedule, night }),
    [admin, dispatch, schedule, night],
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
      {saveError !== null && (
        <Box position="fixed" bottom="3" left="50%" transform="translateX(-50%)" zIndex="3">
          <Badge colorPalette="red" size="lg" title={saveError}>Couldn't save changes</Badge>
        </Box>
      )}
    </BoardContext.Provider>
  );
}
