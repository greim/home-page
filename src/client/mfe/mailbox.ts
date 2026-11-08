/**
 * One side's channels: their handlers, the messages waiting for a handler, and
 * which channels have closed. See the micro-frontends skill, "Delivery".
 */
import { Deferred, Duration, Effect, Either } from "effect";
import {
  ChannelClosed,
  type DeliveryError,
  describeChannel,
  HandlerFailed,
  NoHandler,
} from "./errors.ts";
import type { ChannelKey, DeliverOptions, Handler } from "./protocol.ts";

/** The handler's reply, once a handler has taken the message. */
type Reply = Effect.Effect<unknown, HandlerFailed>;

/** A message waiting for a handler to take it. */
type Waiter = {
  readonly message: unknown;
  readonly taken: Deferred.Deferred<Reply, ChannelClosed>;
};

type Channel = { handler: Handler | null; readonly waiting: Array<Waiter> };

/** What to do with a message, given its channel's state. */
export type DeliveryPlan =
  | { readonly is: "closed" }
  | { readonly is: "handle"; readonly handler: Handler }
  | { readonly is: "no-handler" }
  | { readonly is: "wait"; readonly timeout: Duration.Duration | null };

export const planDelivery = (
  handler: Handler | null,
  closed: boolean,
  deliveryTimeout: number,
): DeliveryPlan => {
  if (closed) {
    return { is: "closed" };
  }
  if (handler !== null) {
    return { is: "handle", handler };
  }
  if (deliveryTimeout <= 0) {
    return { is: "no-handler" };
  }
  return {
    is: "wait",
    timeout: Number.isFinite(deliveryTimeout) ? Duration.millis(deliveryTimeout) : null,
  };
};

export type Mailbox = {
  /** Delivers a message to its channel's handler, waiting for one if need be. */
  readonly deliver: (
    channel: ChannelKey,
    message: unknown,
    options: Pick<DeliverOptions, "deliveryTimeout">,
  ) => Effect.Effect<unknown, DeliveryError>;
  /** Sets a channel's handler. Throws if it already has one or has closed. */
  readonly receive: (channel: ChannelKey, handler: Handler) => () => void;
  /** Closes a mount-node channel. String channels never close. */
  readonly close: (channel: ChannelKey) => void;
};

/**
 * Calls the handler right away, so handlers see messages in the order they're
 * started, and settles its reply as an effect.
 */
const startHandler = (
  handler: Handler,
  message: unknown,
): Effect.Effect<unknown, HandlerFailed> => {
  const settled = (async () => await handler(message))().then(
    Either.right,
    (cause: unknown) => Either.left(new HandlerFailed({ cause })),
  );
  return Effect.promise(() => settled).pipe(Effect.flatMap((result) => result));
};

export const makeMailbox = (): Mailbox => {
  const channels = new Map<ChannelKey, Channel>();
  const closed = new WeakSet<Node>();

  const isClosed = (key: ChannelKey) => typeof key !== "string" && closed.has(key);

  const channelOf = (key: ChannelKey): Channel => {
    const existing = channels.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created: Channel = { handler: null, waiting: [] };
    channels.set(key, created);
    return created;
  };

  const forgetIfIdle = (key: ChannelKey) => {
    const channel = channels.get(key);
    if (channel !== undefined && channel.handler === null && channel.waiting.length === 0) {
      channels.delete(key);
    }
  };

  const wait = (
    key: ChannelKey,
    message: unknown,
    timeout: Duration.Duration | null,
    deliveryTimeout: number,
  ) =>
    Effect.gen(function* () {
      const taken = yield* Deferred.make<Reply, ChannelClosed>();
      const waiter: Waiter = { message, taken };
      channelOf(key).waiting.push(waiter);
      const awaited = Deferred.await(taken);
      return yield* (timeout === null ? awaited : awaited.pipe(
        Effect.timeoutFail({
          duration: timeout,
          onTimeout: () =>
            new NoHandler({ channel: describeChannel(key), timeout: deliveryTimeout }),
        }),
      )).pipe(
        Effect.ensuring(Effect.sync(() => {
          const waiting = channels.get(key)?.waiting ?? [];
          const at = waiting.indexOf(waiter);
          if (at >= 0) {
            waiting.splice(at, 1);
          }
          forgetIfIdle(key);
        })),
        // The timeout covers only delivery, not the handler's work.
        Effect.flatten,
      );
    });

  return {
    deliver: (key, message, { deliveryTimeout }) =>
      Effect.suspend(() => {
        const plan = planDelivery(
          channels.get(key)?.handler ?? null,
          isClosed(key),
          deliveryTimeout,
        );
        switch (plan.is) {
          case "closed":
            return Effect.fail(new ChannelClosed());
          case "no-handler":
            return Effect.fail(
              new NoHandler({ channel: describeChannel(key), timeout: deliveryTimeout }),
            );
          case "handle":
            return startHandler(plan.handler, message);
          case "wait":
            return wait(key, message, plan.timeout, deliveryTimeout);
          default:
            return plan satisfies never;
        }
      }),

    receive: (key, handler) => {
      if (isClosed(key)) {
        throw new Error(`Can't receive on ${describeChannel(key)}: it has closed`);
      }
      const channel = channelOf(key);
      if (channel.handler !== null) {
        throw new Error(`${describeChannel(key)} already has a handler`);
      }
      channel.handler = handler;
      for (const waiter of channel.waiting.splice(0)) {
        Deferred.unsafeDone(waiter.taken, Effect.succeed(startHandler(handler, waiter.message)));
      }
      return () => {
        if (channels.get(key)?.handler === handler) {
          channel.handler = null;
          forgetIfIdle(key);
        }
      };
    },

    close: (key) => {
      if (typeof key === "string") {
        return;
      }
      closed.add(key);
      for (const waiter of channels.get(key)?.waiting.splice(0) ?? []) {
        Deferred.unsafeDone(waiter.taken, Effect.fail(new ChannelClosed()));
      }
      channels.delete(key);
    },
  };
};
