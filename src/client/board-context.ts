import { createContext, useContext } from "react";
import type { Schedule } from "../common/day-cycle.ts";
import type { LayoutAction } from "../common/layout-ops.ts";
import type { FullScreenView } from "./full-screen/full-screen.ts";

/** The key that toggles admin mode. F2 has no browser default (F1 opens help in some). */
export const adminModeKey = "F2";

export type Board = {
  readonly admin: boolean;
  readonly dispatch: (action: LayoutAction) => void;
  /**
   * Opens a full-screen view as a modal: the column editor, a widget's full-screen
   * view, and so on. Only the page opens them (see full-screen.ts).
   */
  readonly open: (view: FullScreenView) => void;
  /** When the user's day starts and ends, as the layout has it. */
  readonly schedule: Schedule;
  /**
   * Night mode: it's past the end of the user's day and before the start of the
   * next, and the user isn't previewing daytime in admin mode.
   */
  readonly night: boolean;
  /** How quickly the page moves between day and night (a CSS transition's duration and easing). */
  readonly nightPace: string;
};

export const BoardContext = createContext<Board | null>(null);

export const useBoard = (): Board => {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error("useBoard must be used within BoardContext");
  }
  return board;
};
