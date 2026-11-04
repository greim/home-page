/** The page's MFE manager, for widget cards to embed widgets with. */
import { createContext, useContext } from "react";
import type { Manager } from "./mfe/manager-live.ts";

export const WidgetManagerContext = createContext<Manager | null>(null);

export const useWidgetManager = (): Manager => {
  const manager = useContext(WidgetManagerContext);
  if (manager === null) {
    throw new Error("useWidgetManager must be used within WidgetManagerContext");
  }
  return manager;
};
