/**
 * Imperative shell of the shell's half of the framework: the real pipes, and
 * the plain, promise-based manager the app uses.
 */
import { Effect } from "effect";
import type { SendResult } from "./errors.ts";
import { runToResult } from "./errors.ts";
import { makeManager, ManagerIo, PipeError } from "./manager.ts";
import {
  type ChannelKey,
  deliverOptions,
  type Handler,
  isReserved,
  mountChannel,
  type MountMessage,
  type Registrar,
  registrarKey,
  type SendOptions,
  unmountChannel,
  type UnmountMessage,
} from "./protocol.ts";

export type Resolver = (mfe: string) => string | Promise<string>;

export type Manager = {
  /** Sends an MFE a message, loading it first if need be. Never rejects. */
  readonly send: (
    args: { readonly mfe: string; readonly channel: ChannelKey; readonly message: unknown },
    options?: SendOptions,
  ) => Promise<SendResult>;
  /** Handles messages an MFE sends on a channel. Returns a function that removes the handler. */
  readonly receive: (mfe: string, channel: ChannelKey, handler: Handler) => () => void;
  /** Renders an MFE's view into `node`. Used by MfeView. */
  readonly mount: (
    args: Omit<MountMessage, "node"> & {
      readonly mfe: string;
      readonly node: Element;
    },
  ) => Promise<SendResult>;
  /** Sends a mounted view new props. Used by MfeView. */
  readonly update: (args: {
    readonly mfe: string;
    readonly node: Element;
    readonly props: unknown;
  }) => Promise<SendResult>;
  /** Unmounts a view and closes its channel on both sides. Used by MfeView. */
  readonly unmount: (args: { readonly mfe: string; readonly node: Element }) => void;
};

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new PipeError({ cause }) });

const managerIo = (resolver: Resolver) =>
  ManagerIo.of({
    resolve: (mfe) => attempt(async () => await resolver(mfe)),
    importModule: (url) => attempt(() => import(url)).pipe(Effect.asVoid),
    probe: (url) => attempt(() => fetch(url, { method: "HEAD" }).then((r) => r.status)),
    installRegistrar: (registrar: Registrar) =>
      Effect.sync(() => {
        (globalThis as Record<symbol, unknown>)[registrarKey] = registrar;
      }),
  });

const refuseReserved = (channel: ChannelKey) => {
  if (isReserved(channel)) {
    throw new Error(`Channels starting "mfe:" are the framework's own`);
  }
};

/** Creates the page's manager. Call it once, in the shell's entry point. */
export const createManager = (options: { readonly resolver: Resolver }): Manager => {
  const core = Effect.runSync(
    makeManager.pipe(Effect.provideService(ManagerIo, managerIo(options.resolver))),
  );
  const deliver = (mfe: string, channel: ChannelKey, message: unknown, o: SendOptions) =>
    runToResult(core.send(mfe, channel, message, deliverOptions(o)));
  return {
    send: ({ mfe, channel, message }, o = {}) => {
      refuseReserved(channel);
      return deliver(mfe, channel, message, o);
    },
    receive: (mfe, channel, handler) => {
      refuseReserved(channel);
      return core.receive(mfe, channel, handler);
    },
    mount: ({ mfe, view, node, props }) =>
      deliver(mfe, mountChannel, { view, node, props } satisfies MountMessage, {}),
    update: ({ mfe, node, props }) => deliver(mfe, node, props, {}),
    unmount: ({ mfe, node }) => {
      core.close(mfe, node);
      void deliver(mfe, unmountChannel, { node } satisfies UnmountMessage, {});
    },
  };
};
