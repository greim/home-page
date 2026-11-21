/**
 * What's open in a bookmarks widget: the list itself, and which folders. Ephemeral, so it's kept in
 * the browser's localStorage, not the layout (see the `ephemeral-state` skill). Fresh browsers see
 * the list open and every folder closed.
 */
import { Option, Schema } from "effect";

export const OpenState = Schema.Struct({
  /** Showing only the heading. */
  collapsed: Schema.Boolean,
  /** Ids of the folders that are open. */
  expanded: Schema.Array(Schema.String),
});
export type OpenState = typeof OpenState.Type;

export const initialOpenState: OpenState = { collapsed: false, expanded: [] };

const parseJson = Schema.decodeUnknownOption(Schema.parseJson(OpenState));

/** The state stored as `text`, or the initial one if there's none or it's unreadable. */
export const readOpenState = (text: string | null): OpenState =>
  text === null ? initialOpenState : Option.getOrElse(parseJson(text), () => initialOpenState);

export const openStateText = (state: OpenState): string => JSON.stringify(state);

/** Opens or closes the whole widget, leaving its heading. */
export const toggleCollapsed = (state: OpenState): OpenState => ({
  ...state,
  collapsed: !state.collapsed,
});

export const isExpanded = (state: OpenState, folderId: string): boolean =>
  state.expanded.includes(folderId);

/** Opens or closes one folder. */
export const toggleFolder = (state: OpenState, folderId: string): OpenState => ({
  ...state,
  expanded: isExpanded(state, folderId)
    ? state.expanded.filter((id) => id !== folderId)
    : [...state.expanded, folderId],
});
