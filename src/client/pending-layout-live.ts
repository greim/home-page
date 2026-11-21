/**
 * Keeps the page's idea of the layout's pending changes up to date: asks the server when the
 * page starts, when its layout changes (once the change has been saved), when the window is
 * focused again, and every few seconds (so changes made in a terminal show up too). Runs accept and
 * discard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commitMessageApi } from "../common/apis/commit-message.ts";
import type { Layout } from "../common/model.ts";
import {
  acceptedWith,
  checked,
  failed,
  finished,
  initialPendingState,
  nextSuggestion,
  noSuggestions,
  type PendingState,
  started,
  suggested,
  typed,
} from "./pending-layout.ts";
import { layoutHistory as api } from "./layout-history-client.ts";
import { apiBase, makeApiClient } from "./widget-api-client.ts";
import { assistantPort } from "./widget-apis-live.ts";

const pollMs = 5000;
/** How long after the layout changes to check: past the save. */
const settleMs = 1200;

const caller = { widgetType: "page", widgetId: "layout-history" } as const;

export function usePendingLayout(layout: Layout, onReplace: (layout: Layout) => void) {
  const [state, setState] = useState<PendingState>(initialPendingState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const describer = useMemo(
    () =>
      makeApiClient(
        commitMessageApi,
        apiBase(commitMessageApi.server, location, assistantPort()),
        caller,
        fetch,
      ),
    [],
  );
  const memory = useRef(noSuggestions);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const result = await api.status({});
      setState((s) => result.ok ? checked(s, result.value) : failed(s, result.error.message));
      if (!result.ok || result.value !== "modified") {
        memory.current = noSuggestions;
        return;
      }
      const diff = await api.diff({});
      if (!diff.ok) return;
      const next = nextSuggestion(memory.current, diff.value);
      memory.current = next.memory;
      if (!next.ask) return;
      const described = await describer.suggest({ diff: diff.value });
      // Claude being unavailable only means the default message is used.
      if (described.ok) setState((s) => suggested(s, described.value.message));
    } finally {
      checking.current = false;
    }
  }, [api, describer]);

  useEffect(() => {
    const timer = setTimeout(check, settleMs);
    return () => clearTimeout(timer);
  }, [layout, check]);

  useEffect(() => {
    const interval = setInterval(check, pollMs);
    globalThis.addEventListener("focus", check);
    return () => {
      clearInterval(interval);
      globalThis.removeEventListener("focus", check);
    };
  }, [check]);

  const accept = useCallback(async () => {
    const message = acceptedWith(stateRef.current, new Date());
    setState(started);
    const result = await api.accept({ message });
    memory.current = noSuggestions;
    setState((s) => result.ok ? finished() : failed(s, result.error.message));
  }, [api]);

  const discard = useCallback(async () => {
    setState(started);
    const result = await api.discard({});
    if (result.ok) onReplace(result.value);
    memory.current = noSuggestions;
    setState((s) => result.ok ? finished() : failed(s, result.error.message));
  }, [api, onReplace]);

  const setMessage = useCallback((message: string) => setState((s) => typed(s, message)), []);

  return { state, accept, discard, setMessage };
}
