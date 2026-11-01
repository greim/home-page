import { createContext, useContext } from "react";
import type { LayoutAction } from "../common/layout-ops.ts";

/** A request to open the column content editor, optionally with a widget selected. */
export type EditRequest = {
  readonly columnId: string;
  readonly widgetId: string | null;
};

export type Board = {
  readonly admin: boolean;
  readonly dispatch: (action: LayoutAction) => void;
  readonly edit: (request: EditRequest) => void;
};

export const BoardContext = createContext<Board | null>(null);

export const useBoard = (): Board => {
  const board = useContext(BoardContext);
  if (board === null) {
    throw new Error("useBoard must be used within BoardContext");
  }
  return board;
};
