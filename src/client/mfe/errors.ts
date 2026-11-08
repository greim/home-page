/**
 * The ways a message can fail, as tagged errors inside the framework and as a
 * plain {@link SendResult} at its public API. See the micro-frontends skill, "Results".
 */
import { Data, Effect } from "effect";
import type { ChannelKey } from "./protocol.ts";

/** The recipient's handler threw or rejected. */
export class HandlerFailed extends Data.TaggedError("HandlerFailed")<{ cause: unknown }> {}

/** No handler took the message within its delivery timeout. */
export class NoHandler extends Data.TaggedError("NoHandler")<{
  channel: string;
  timeout: number;
}> {}

/** The message's mount-node channel closed. */
export class ChannelClosed extends Data.TaggedError("ChannelClosed")<Record<never, never>> {}

/** The sender's signal fired. */
export class Aborted extends Data.TaggedError("Aborted")<{ reason: unknown }> {}

/** The MFE's bundle URL returned 404. */
export class NotFound extends Data.TaggedError("NotFound")<{ mfe: string; url: string }> {}

/** The MFE's bundle couldn't be fetched or executed. */
export class NetworkFailed extends Data.TaggedError("NetworkFailed")<{
  mfe: string;
  url: string;
  cause: unknown;
}> {}

/** The shell's resolver threw or rejected. */
export class ResolverFailed extends Data.TaggedError("ResolverFailed")<{
  mfe: string;
  cause: unknown;
}> {}

/** The bundle didn't register, registered twice, or registered under another ID. */
export class RegistrationFailed extends Data.TaggedError("RegistrationFailed")<{
  mfe: string;
  reason: string;
}> {}

/** A failure the other side already reported, passed on as it was. */
export class Reported extends Data.TaggedError("Reported")<{ error: SendError }> {}

export type DeliveryError = HandlerFailed | NoHandler | ChannelClosed | Aborted;
export type LoadError = NotFound | NetworkFailed | ResolverFailed | RegistrationFailed;
export type MfeError = DeliveryError | LoadError | Reported;

export type SendError =
  & { readonly message: string }
  & (
    | { readonly is: "handler-failed"; readonly cause: unknown }
    | { readonly is: "no-handler" }
    | { readonly is: "channel-closed" }
    | { readonly is: "aborted"; readonly reason: unknown }
    | { readonly is: "not-found"; readonly url: string }
    | { readonly is: "network"; readonly url: string; readonly cause: unknown }
    | { readonly is: "resolver"; readonly cause: unknown }
    | { readonly is: "registration"; readonly reason: string }
  );

export type SendResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: SendError };

/** How a channel is named in error messages. */
export const describeChannel = (channel: ChannelKey): string =>
  typeof channel === "string" ? `channel "${channel}"` : "a mount-node channel";

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const toSendError = (error: MfeError): SendError => {
  switch (error._tag) {
    case "HandlerFailed":
      return {
        is: "handler-failed",
        cause: error.cause,
        message: `The handler failed: ${describeCause(error.cause)}`,
      };
    case "NoHandler":
      return {
        is: "no-handler",
        message: `No handler on ${error.channel} took the message within ${error.timeout}ms`,
      };
    case "ChannelClosed":
      return { is: "channel-closed", message: "The channel closed" };
    case "Aborted":
      return {
        is: "aborted",
        reason: error.reason,
        message: `The sender gave up: ${describeCause(error.reason)}`,
      };
    case "NotFound":
      return {
        is: "not-found",
        url: error.url,
        message: `"${error.mfe}" wasn't found at ${error.url}`,
      };
    case "NetworkFailed":
      return {
        is: "network",
        url: error.url,
        cause: error.cause,
        message: `"${error.mfe}" couldn't be loaded from ${error.url}: ${
          describeCause(error.cause)
        }`,
      };
    case "ResolverFailed":
      return {
        is: "resolver",
        cause: error.cause,
        message: `Couldn't find the URL of "${error.mfe}": ${describeCause(error.cause)}`,
      };
    case "RegistrationFailed":
      return { is: "registration", reason: error.reason, message: error.reason };
    case "Reported":
      return error.error;
    default:
      return error satisfies never;
  }
};

/** Runs a send's effect, settling every failure as a result. Never rejects. */
export const runToResult = (effect: Effect.Effect<unknown, MfeError>): Promise<SendResult> =>
  Effect.runPromise(
    effect.pipe(
      Effect.match({
        onSuccess: (value): SendResult => ({ ok: true, value }),
        onFailure: (error): SendResult => ({ ok: false, error: toSendError(error) }),
      }),
    ),
  );

/**
 * Fails with {@link Aborted} as soon as `signal` fires, interrupting `effect`,
 * so whatever it was waiting on is cleaned up.
 */
export const withAbort = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  signal: AbortSignal | null,
): Effect.Effect<A, E | Aborted, R> => {
  if (signal === null) {
    return effect;
  }
  if (signal.aborted) {
    return Effect.fail(new Aborted({ reason: signal.reason }));
  }
  const aborted = Effect.async<never, Aborted>((resume) => {
    const onAbort = () => resume(Effect.fail(new Aborted({ reason: signal.reason })));
    signal.addEventListener("abort", onAbort, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", onAbort));
  });
  return Effect.raceFirst(effect, aborted);
};
