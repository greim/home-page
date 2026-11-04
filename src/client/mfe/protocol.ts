/**
 * The contract between the shell's half of the framework and each MFE's half.
 * The two run in separate bundles with separate copies of Effect, so nothing
 * here is an Effect value: only plain functions, promises and data.
 */
import type { SendResult } from "./errors.ts";

/** A key in a map of channels. A mount node is a channel too. */
export type ChannelKey = string | Node;

/** A message's handler. A reply may be a promise; a throw or rejection fails the message. */
export type Handler = (message: unknown) => unknown;

export type DeliverOptions = {
  /** Milliseconds to wait for a handler: 0 needs one already, Infinity waits forever. */
  readonly deliveryTimeout: number;
  readonly signal: AbortSignal | null;
};

/** What a sender may pass. */
export type SendOptions = {
  readonly deliveryTimeout?: number;
  readonly signal?: AbortSignal;
};

export const defaultDeliveryTimeout = 5000;

export const deliverOptions = (options: SendOptions): DeliverOptions => ({
  deliveryTimeout: options.deliveryTimeout ?? defaultDeliveryTimeout,
  signal: options.signal ?? null,
});

/** What an MFE gives the manager when it registers: a way to send it messages. */
export type MfePort = {
  readonly deliver: (
    channel: ChannelKey,
    message: unknown,
    options: DeliverOptions,
  ) => Promise<SendResult>;
};

/** What the manager gives an MFE back: a way to send the shell messages. */
export type ShellPort = {
  readonly deliver: (
    channel: ChannelKey,
    message: unknown,
    options: DeliverOptions,
  ) => Promise<SendResult>;
};

/** The manager, as an MFE's bundle finds it. */
export type Registrar = {
  /** Throws if the registration is invalid; the manager also records why. */
  readonly register: (mfe: string, port: MfePort) => ShellPort;
};

/** Where the manager puts its {@link Registrar} for bundles to find. */
export const registrarKey: unique symbol = Symbol.for("mfe-manager");

/** Channels the framework uses itself. Apps can't receive on these. */
export const mountChannel = "mfe:mount";
export const unmountChannel = "mfe:unmount";

export const isReserved = (channel: ChannelKey): boolean =>
  typeof channel === "string" && channel.startsWith("mfe:");

/** Sent on {@link mountChannel}: render `view` into `node`. */
export type MountMessage = {
  readonly view: string;
  readonly node: Element;
  readonly props: unknown;
};

/** Sent on {@link unmountChannel}: unmount whatever is rendered into `node`. */
export type UnmountMessage = { readonly node: Element };

/** Sent by an MFE on a view's mount-node channel when the view fails to render. */
export type RenderErrorMessage = { readonly renderError: string };
