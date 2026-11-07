/**
 * The assistant's event log: every event it emits, numbered in order. Clients
 * read it from any point, getting what they missed and then what comes next,
 * so a turn survives page reloads and dropped connections. Only the most recent
 * events are kept.
 */
import { Effect, PubSub, Ref, Stream } from "effect";
import type { ChatEvent, LoggedEvent } from "../common/assistant.ts";

export type EventLog = {
  /** Identifies this log: a restarted service starts a new one, numbered from 1 again. */
  readonly id: string;
  /** Logs an event, as part of the given conversation, and returns its number. */
  readonly publish: (event: ChatEvent, sessionId: string | null) => Effect.Effect<number>;
  /**
   * Sends an event to current readers without keeping it (e.g. streamed text, which the
   * finished text supersedes). It has the number of the last kept event.
   */
  readonly publishTransient: (event: ChatEvent, sessionId: string | null) => Effect.Effect<void>;
  /** The number of the last event logged; 0 before any. */
  readonly latest: Effect.Effect<number>;
  /** The events after `after` that are still kept, then each new one as it's logged. Never ends. */
  readonly after: (after: number) => Stream.Stream<LoggedEvent>;
};

type State = { readonly seq: number; readonly kept: ReadonlyArray<LoggedEvent> };

export const makeEventLog = (id: string, capacity: number): Effect.Effect<EventLog> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<State>({ seq: 0, kept: [] });
    const live = yield* PubSub.unbounded<LoggedEvent>();
    // One publisher at a time, so events reach subscribers in number order.
    const lock = yield* Effect.makeSemaphore(1);

    const publish = (event: ChatEvent, sessionId: string | null) =>
      lock.withPermits(1)(Effect.gen(function* () {
        const logged = yield* Ref.modify(state, (s): [LoggedEvent, State] => {
          const next = { seq: s.seq + 1, event, transient: false, sessionId };
          return [next, { seq: next.seq, kept: [...s.kept, next].slice(-capacity) }];
        });
        yield* PubSub.publish(live, logged);
        return logged.seq;
      }));

    const after = (after: number): Stream.Stream<LoggedEvent> =>
      Stream.unwrapScoped(Effect.gen(function* () {
        // Subscribe before reading what's kept, so nothing falls between the two;
        // anything in both is dropped from the live part by its number.
        const subscription = yield* PubSub.subscribe(live);
        const { kept } = yield* Ref.get(state);
        const missed = kept.filter((e) => e.seq > after);
        const upTo = missed.at(-1)?.seq ?? after;
        return Stream.concat(
          Stream.fromIterable(missed),
          Stream.fromQueue(subscription).pipe(Stream.filter((e) => e.transient || e.seq > upTo)),
        );
      }));

    const publishTransient = (event: ChatEvent, sessionId: string | null) =>
      lock.withPermits(1)(Effect.gen(function* () {
        const { seq } = yield* Ref.get(state);
        yield* PubSub.publish(live, { seq, event, transient: true, sessionId });
      }));

    return {
      id,
      publish,
      publishTransient,
      latest: Effect.map(Ref.get(state), (s) => s.seq),
      after,
    } satisfies EventLog;
  });
