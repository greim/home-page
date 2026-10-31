/**
 * Serializes saves so they reach the server in order, and coalesces bursts:
 * while one save is in flight, only the most recent pending value is kept.
 */
import { Effect } from "effect";

type Pending<A> = { has: false } | { has: true; value: A };

export type SaveQueue<A> = {
  readonly save: (value: A) => void;
};

export const makeSaveQueue = <A, E>(
  put: (value: A) => Effect.Effect<void, E>,
  onResult: (result: { ok: true } | { ok: false; error: E }) => void,
): SaveQueue<A> => {
  let pending: Pending<A> = { has: false };
  let inFlight = false;

  const pump = (): void => {
    if (inFlight || !pending.has) {
      return;
    }
    const { value } = pending;
    pending = { has: false };
    inFlight = true;
    Effect.runFork(
      put(value).pipe(
        Effect.match({
          onSuccess: () => onResult({ ok: true }),
          onFailure: (error) => onResult({ ok: false, error }),
        }),
        Effect.ensuring(Effect.sync(() => {
          inFlight = false;
          pump();
        })),
      ),
    );
  };

  return {
    save: (value) => {
      pending = { has: true, value };
      pump();
    },
  };
};
