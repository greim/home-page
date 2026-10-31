/** Detects two Escape presses in rapid succession. */

export const doubleEscapeWindowMs = 500;

export type EscapeState = { readonly lastEscapeAt: number | null };

export const initialEscapeState: EscapeState = { lastEscapeAt: null };

export type EscapeResult = {
  readonly state: EscapeState;
  readonly toggle: boolean;
};

export const onEscape = (state: EscapeState, now: number): EscapeResult => {
  const isDouble = state.lastEscapeAt !== null &&
    now - state.lastEscapeAt <= doubleEscapeWindowMs;
  return isDouble
    ? { state: initialEscapeState, toggle: true }
    : { state: { lastEscapeAt: now }, toggle: false };
};
