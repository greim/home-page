/**
 * In admin mode, some ordinary elements (a column heading, a widget, a column's
 * background) act as buttons. These helpers give them a button's semantics only
 * while admin mode is on, so the rendered tree is otherwise the same in both modes.
 */
import type { KeyboardEvent } from "react";

type KeyEvent = Pick<KeyboardEvent<HTMLElement>, "key" | "target" | "currentTarget">;

/**
 * Enter or Space on the element itself (not bubbled up from something inside
 * it, which may be a button of its own) activates it.
 */
export const isActivation = (event: KeyEvent): boolean =>
  event.target === event.currentTarget && (event.key === "Enter" || event.key === " ");

export type AdminButtonProps =
  | {
    role: "button";
    tabIndex: 0;
    "aria-label": string;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  }
  | Record<string, never>;

/** Button semantics for an element that's a button only in admin mode. Pair with an onClick. */
export const adminButton = (admin: boolean, label: string): AdminButtonProps =>
  admin
    ? {
      role: "button",
      tabIndex: 0,
      "aria-label": label,
      onKeyDown: (event) => {
        if (!isActivation(event)) return;
        event.preventDefault();
        event.currentTarget.click();
      },
    }
    : {};

/** Styles, applied to an ancestor, that make every such element look clickable. */
export const adminButtonStyles = {
  "& [role=button]": { cursor: "pointer" },
  "& [role=button]:focus-visible": {
    outline: "2px solid",
    outlineColor: "colorPalette.focusRing",
    outlineOffset: "2px",
  },
} as const;
