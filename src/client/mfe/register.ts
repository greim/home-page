/**
 * Functional core of an MFE's half of the framework: registering with the
 * manager, answering its messages, and mounting views where the shell embeds
 * them. Rendering goes through the injected {@link MfeSideIo} pipes.
 */
import { Schema } from "effect";
import { runToResult, type SendResult, withAbort } from "./errors.ts";
import { makeMailbox } from "./mailbox.ts";
import {
  type ChannelKey,
  deliverOptions,
  type Handler,
  isReserved,
  type MfePort,
  mountChannel,
  type Registrar,
  type RenderErrorMessage,
  type SendOptions,
  unmountChannel,
} from "./protocol.ts";

/** A view rendered into a mount node. It's given whatever props the embedder passed. */
export type RenderedView = {
  readonly render: (props: unknown) => void;
  readonly unmount: () => void;
};

/** What an MFE's code uses to talk to the shell. */
export type Shell = {
  readonly send: (
    args: { readonly channel: ChannelKey; readonly message: unknown },
    options?: SendOptions,
  ) => Promise<SendResult>;
  readonly receive: (channel: ChannelKey, handler: Handler) => () => void;
};

export type MfeSideIo<View> = {
  /** The manager's registrar, if this page has a manager. */
  readonly findRegistrar: () => Registrar | undefined;
  /** Starts rendering `view` into `node`. `onError` hears about render errors. */
  readonly mount: (
    node: Element,
    view: View,
    onError: (message: string) => void,
  ) => RenderedView;
};

const Mount = Schema.Struct({
  view: Schema.String,
  node: Schema.Object,
  props: Schema.Unknown,
});

const Unmount = Schema.Struct({ node: Schema.Object });

const decodeMount = Schema.decodeUnknownSync(Mount);
const decodeUnmount = Schema.decodeUnknownSync(Unmount);

/**
 * Registers this bundle as MFE `id`. Throws if the page has no manager, or the
 * manager refuses the registration; either is a programming error.
 */
export const registerMfe = <View>(
  io: MfeSideIo<View>,
  id: string,
  factory: (shell: Shell) => Readonly<Record<string, View>>,
): void => {
  const registrar = io.findRegistrar();
  if (registrar === undefined) {
    throw new Error(`registerMfe("${id}"): this page has no MFE manager`);
  }
  const mailbox = makeMailbox();
  const port: MfePort = {
    deliver: (channel, message, options) =>
      runToResult(withAbort(mailbox.deliver(channel, message, options), options.signal)),
  };
  const shellPort = registrar.register(id, port);

  const shell: Shell = {
    send: ({ channel, message }, options = {}) =>
      shellPort.deliver(channel, message, deliverOptions(options)),
    receive: (channel, handler) => {
      if (isReserved(channel)) {
        throw new Error(`Channels starting "mfe:" are the framework's own`);
      }
      return mailbox.receive(channel, handler);
    },
  };
  const views = new Map(Object.entries(factory(shell)));
  const mounted = new Map<Element, { readonly view: RenderedView; readonly stop: () => void }>();

  const reportRenderError = (node: Element) => (renderError: string) => {
    const message: RenderErrorMessage = { renderError };
    void shellPort.deliver(node, message, deliverOptions({}));
  };

  mailbox.receive(mountChannel, (raw) => {
    const { view: name, node, props } = decodeMount(raw);
    const element = node as Element;
    const view = views.get(name);
    if (view === undefined) {
      const known = [...views.keys()].map((k) => `"${k}"`).join(", ");
      throw new Error(`"${id}" has no view called "${name}" (it has ${known || "none"})`);
    }
    if (mounted.has(element)) {
      throw new Error(`Something is already mounted there`);
    }
    const rendered = io.mount(element, view, reportRenderError(element));
    // Props for this view arrive on its mount node, which is its own channel.
    const stop = mailbox.receive(element, (next) => rendered.render(next));
    mounted.set(element, { view: rendered, stop });
    rendered.render(props);
    return null;
  });

  mailbox.receive(unmountChannel, (raw) => {
    const element = decodeUnmount(raw).node as Element;
    const entry = mounted.get(element);
    mounted.delete(element);
    entry?.stop();
    entry?.view.unmount();
    mailbox.close(element);
    return null;
  });
};
