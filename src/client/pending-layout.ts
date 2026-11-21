/**
 * The banner that says the layout has changes to accept or discard (see
 * src/server/layout-history.ts): what it shows, for what the server last said, and the message a
 * change is accepted with.
 */
import type { Pending } from "../common/apis/layout-history.ts";

/** What the page knows about the layout's changes. */
export type PendingState = {
  /** What the server last said; null until it has. */
  readonly pending: Pending | null;
  /** An accept or discard is under way. */
  readonly working: boolean;
  /** Why the last check, accept or discard failed, if it did. */
  readonly problem: string | null;
  /** What the change will be accepted with: suggested by Claude, or typed. Blank for none yet. */
  readonly message: string;
  /** The user has typed in the message, so suggestions no longer replace it. */
  readonly typed: boolean;
};

export const initialPendingState: PendingState = {
  pending: null,
  working: false,
  problem: null,
  message: "",
  typed: false,
};

/** Whether to show the banner: when there's something to accept, or something went wrong. */
export const showsBanner = (state: PendingState): boolean =>
  state.problem !== null || (state.pending !== null && state.pending !== "clean");

/** The banner's first line. */
export const bannerTitle = (state: PendingState): string =>
  state.pending === "new"
    ? "Your layout isn't saved as a version yet"
    : "You've changed your layout";

/** What a change is accepted with until something better says what it was. */
export const defaultMessage = (now: Date): string =>
  `Layout changes, ${
    now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }`;

/** The state after the server's answer to a check. */
export const checked = (state: PendingState, pending: Pending): PendingState => ({
  ...state,
  pending,
  problem: null,
});

/** The state after something failed. */
export const failed = (state: PendingState, message: string): PendingState => ({
  ...state,
  working: false,
  problem: message,
});

/** The state after an accept or discard began. */
export const started = (state: PendingState): PendingState => ({
  ...state,
  working: true,
  problem: null,
});

/** The state after an accept or discard succeeded: nothing is pending, so nothing to say. */
export const finished = (): PendingState => ({
  ...initialPendingState,
  pending: "clean",
});

/** The state after Claude suggested a message: it stands unless the user has written their own. */
export const suggested = (state: PendingState, message: string): PendingState =>
  state.typed ? state : { ...state, message };

/** The state after the user edited the message. */
export const typed = (state: PendingState, message: string): PendingState => ({
  ...state,
  message,
  typed: true,
});

/** What a change is accepted with: the message, or the default if it's blank. */
export const acceptedWith = (state: PendingState, now: Date): string =>
  state.message.trim() === "" ? defaultMessage(now) : state.message.trim();

/** What's been seen of the change, to decide when to ask Claude to describe it. */
export type SuggestionMemory = {
  /** The diff as of the last check. */
  readonly seen: string;
  /** The diff Claude was last asked about. */
  readonly askedAbout: string;
};

export const noSuggestions: SuggestionMemory = { seen: "", askedAbout: "" };

/**
 * Whether to ask Claude about `diff`, found by a check, and what to remember. It asks once the
 * change has held still across two checks (not on every click while the user is mid-edit), and
 * not again for a diff it's already described.
 */
export const nextSuggestion = (
  memory: SuggestionMemory,
  diff: string,
): { readonly ask: boolean; readonly memory: SuggestionMemory } => {
  const ask = diff.trim() !== "" && diff === memory.seen && diff !== memory.askedAbout;
  return { ask, memory: { seen: diff, askedAbout: ask ? diff : memory.askedAbout } };
};
