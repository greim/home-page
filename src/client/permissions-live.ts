/**
 * Imperative shell for widget permissions (see permissions.ts): the answers in this
 * browser's localStorage, and a hook that re-renders when one changes, here or in
 * another tab.
 */
import { useSyncExternalStore } from "react";
import type { Permissions } from "../common/widgets.ts";
import { answerText, permissionKey, type PermissionState, permissionState } from "./permissions.ts";

const listeners = new Set<() => void>();
/** Answers kept for this page only, where localStorage can't be written. */
const memory = new Map<string, string>();
/** Bumped on every change, so subscribers re-read. */
let version = 0;

const changed = () => {
  version++;
  for (const listener of listeners) listener();
};

// An answer given in another tab.
globalThis.addEventListener("storage", changed);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The stored answer for a widget type; null if there's none, or storage can't be read. */
const stored = (widgetType: string): string | null => {
  try {
    return localStorage.getItem(permissionKey(widgetType));
  } catch {
    return null;
  }
};

/** Records the user's answer to a widget type's permissions. */
export const answer = (widgetType: string, permissions: Permissions, yes: boolean): void => {
  try {
    localStorage.setItem(permissionKey(widgetType), answerText(permissions, yes));
  } catch {
    // Storage is off (e.g. a private window): the answer lasts until the page reloads.
    memory.set(widgetType, answerText(permissions, yes));
  }
  changed();
};

/** Where each widget type stands; the component re-renders when any answer changes. */
export const usePermissions = (): (
  widgetType: string,
  permissions: Permissions | null,
) => PermissionState => {
  useSyncExternalStore(subscribe, () => version);
  return (widgetType, permissions) =>
    permissionState(permissions, stored(widgetType) ?? memory.get(widgetType) ?? null);
};
