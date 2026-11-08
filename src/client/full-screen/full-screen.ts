/**
 * Full-screen views: the assistant, the settings dialog, the column editor, and
 * widgets' own full-screen views. Each opens as a modal over the page, and from
 * there can be torn off into a picture-in-picture (PiP) window. The rules:
 *
 * - At most one modal. While it's open, the page beneath can't be clicked, so
 *   nothing else can open one; it opens only from the page.
 * - At most one PiP window (the browser allows no more). Tearing a modal off
 *   moves its view there, closing the modal; any view already there is replaced.
 * - Opening the view that's in the PiP window pulls it back into a modal, and so
 *   does the window's own button while no modal is open.
 *
 * So at most two full-screen views are open at once. This is the functional
 * core: the transitions, and nothing about windows or the DOM. `W` is whatever
 * handle the shell keeps for the PiP window.
 */
import type { Layout } from "../../common/model.ts";

export type FullScreenView =
  | { readonly is: "assistant" }
  | { readonly is: "settings" }
  | { readonly is: "column-editor"; readonly columnId: string; readonly widgetId: string | null }
  | { readonly is: "widget"; readonly widgetId: string };

export type FullScreenState<W> = {
  readonly modal: FullScreenView | null;
  readonly pip: { readonly view: FullScreenView; readonly window: W } | null;
};

export const closed: FullScreenState<never> = { modal: null, pip: null };

/**
 * Identifies a view, so opening one that's already open finds it. A column's
 * editor is the same view whichever widget it was opened on.
 */
export const viewKey = (view: FullScreenView): string => {
  switch (view.is) {
    case "assistant":
    case "settings":
      return view.is;
    case "column-editor":
      return `column-editor:${view.columnId}`;
    case "widget":
      return `widget:${view.widgetId}`;
    default:
      return view satisfies never;
  }
};

const same = (a: FullScreenView, b: FullScreenView): boolean => viewKey(a) === viewKey(b);

/**
 * Opens `view` as a modal: pulled back from the PiP window if it's there. Ignored
 * while a modal is open, since nothing on the page can be clicked then.
 */
export const open = <W>(state: FullScreenState<W>, view: FullScreenView): FullScreenState<W> => {
  if (state.modal !== null) return state;
  if (state.pip !== null && same(state.pip.view, view)) return { modal: state.pip.view, pip: null };
  return { modal: view, pip: state.pip };
};

export const closeModal = <W>(state: FullScreenState<W>): FullScreenState<W> => ({
  ...state,
  modal: null,
});

/** Closes `view` wherever it is, e.g. when its own Cancel or Save is clicked. */
export const close = <W>(state: FullScreenState<W>, view: FullScreenView): FullScreenState<W> => ({
  modal: state.modal !== null && same(state.modal, view) ? null : state.modal,
  pip: state.pip !== null && same(state.pip.view, view) ? null : state.pip,
});

/** The modal's view has moved to a new PiP window, replacing whatever was in one. */
export const tornOff = <W>(state: FullScreenState<W>, window: W): FullScreenState<W> =>
  state.modal === null ? state : { modal: null, pip: { view: state.modal, window } };

/** The PiP window's view comes back as a modal, if there's no modal in the way. */
export const pullBack = <W>(state: FullScreenState<W>): FullScreenState<W> =>
  state.modal !== null || state.pip === null ? state : { modal: state.pip.view, pip: null };

/** `window` closed (by the user, or replaced). A window that's already gone changes nothing. */
export const pipClosed = <W>(state: FullScreenState<W>, window: W): FullScreenState<W> =>
  state.pip?.window === window ? { ...state, pip: null } : state;

/** Whether `view` is about something still in the layout (the assistant may remove things). */
export const stillThere = (view: FullScreenView, layout: Layout): boolean => {
  switch (view.is) {
    case "assistant":
    case "settings":
      return true;
    case "column-editor":
      return layout.columns.some((c) => c.id === view.columnId);
    case "widget":
      return layout.columns.some((c) => c.widgets.some((w) => w.id === view.widgetId));
    default:
      return view satisfies never;
  }
};

/** Closes views whose column or widget has gone from the layout. */
export const prune = <W>(state: FullScreenState<W>, layout: Layout): FullScreenState<W> => {
  const modal = state.modal !== null && stillThere(state.modal, layout) ? state.modal : null;
  const pip = state.pip !== null && stillThere(state.pip.view, layout) ? state.pip : null;
  return modal === state.modal && pip === state.pip ? state : { modal, pip };
};

/** What the PiP window can offer: to come back as a modal, unless one's open. */
export const canPullBack = <W>(state: FullScreenState<W>): boolean => state.modal === null;
