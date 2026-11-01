import { Badge, Box, Center, Spinner, Text } from "@chakra-ui/react";
import { Effect, Either } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type LayoutAction } from "../common/layout-ops.ts";
import type { Layout } from "../common/model.ts";
import { LuSparkles } from "react-icons/lu";
import { AdminBar, AdminBarButton } from "./admin-bar.tsx";
import { Http, loadLayout, saveLayout } from "./api.ts";
import { AssistantPanel, useAssistant } from "./assistant-panel.tsx";
import { BackgroundEditor } from "./background-editor.tsx";
import { type Board, BoardContext, type EditRequest } from "./board-context.ts";
import { ColumnStrip } from "./column-strip.tsx";
import { initialEscapeState, onEscape } from "./double-escape.ts";
import { HttpLive, run } from "./live.ts";
import { makeSaveQueue } from "./save-queue.ts";
import { WidgetEditor } from "./widget-editor.tsx";

type LoadState =
  | { is: "loading" }
  | { is: "failed"; message: string }
  | { is: "ready"; layout: Layout };

/** Toggles admin mode when Escape is pressed twice in quick succession. */
function useAdminMode(suspended: boolean): boolean {
  const [admin, setAdmin] = useState(false);
  const escape = useRef(initialEscapeState);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || suspendedRef.current) return;
      const result = onEscape(escape.current, event.timeStamp);
      escape.current = result.state;
      if (result.toggle) setAdmin((a) => !a);
    };
    globalThis.addEventListener("keydown", listener);
    return () => globalThis.removeEventListener("keydown", listener);
  }, []);
  return admin;
}

export function App() {
  const [state, setState] = useState<LoadState>({ is: "loading" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const admin = useAdminMode(editing !== null);

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

  const assistant = useAssistant((layout) => dispatch({ is: "replace-layout", layout }));
  const [assistantOpen, setAssistantOpen] = useState(false);

  const board: Board = useMemo(
    () => ({ admin, dispatch, edit: setEditing }),
    [admin, dispatch],
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
        background={state.layout.background}
        columns={state.layout.columns}
        adminBar={
          <AdminBar shown={admin} message="Admin mode · press Esc twice to exit">
            <BackgroundEditor
              background={state.layout.background}
              onChange={(background) => dispatch({ is: "set-background", background })}
            />
            <AdminBarButton
              aria-pressed={assistantOpen}
              bg={assistantOpen ? "gray.100" : undefined}
              onClick={() => setAssistantOpen((open) => !open)}
            >
              <LuSparkles /> Assistant
            </AdminBarButton>
          </AdminBar>
        }
      />
      {admin && assistantOpen && (
        <AssistantPanel
          chat={assistant.chat}
          onSend={assistant.send}
          onReset={assistant.reset}
          onClose={() => setAssistantOpen(false)}
        />
      )}
      {editing !== null && (
        <WidgetEditor
          widget={editing.widget}
          onClose={() => setEditing(null)}
          onSave={(widget) => {
            dispatch(
              editing.insertAt === null
                ? { is: "replace-widget", columnId: editing.columnId, widget }
                : { is: "add-widget", columnId: editing.columnId, index: editing.insertAt, widget },
            );
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
