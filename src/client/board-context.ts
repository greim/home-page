import { createContext, useContext } from "react";
import type { Schedule } from "../common/day-cycle.ts";
import type { LayoutAction } from "../common/layout-ops.ts";

/** The key that toggles admin mode. F2 has no browser default (F1 opens help in some). */
export const adminModeKey = "F2";

/** A request to open the column content editor, optionally with a widget selected. */
export type EditRequest = {
  readonly columnId: string;
  readonly widgetId: string | null;
};

export type Board = {
  readonly admin: boolean;
  readonly dispatch: (action: LayoutAction) => void;
  readonly edit: (request: EditRequest) => void;
  /** When the user's day starts and ends, as the layout has it. */
  readonly schedule: Schedule;
};

export const BoardContext = createContext<Board | null>(null);

export const useBoard = (): Board => {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error("useBoard must be used within BoardContext");
  }
  return board;
};
