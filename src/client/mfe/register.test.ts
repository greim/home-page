import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import type { SendResult } from "./errors.ts";
import {
  type ChannelKey,
  type DeliverOptions,
  type MfePort,
  mountChannel,
  type Registrar,
  unmountChannel,
} from "./protocol.ts";
import { type MfeSideIo, registerMfe, type Shell } from "./register.ts";

type View = string;

/** A fake manager and renderer, recording what the MFE half does. */
const setup = (views: Readonly<Record<string, View>> = { main: "Main" }) => {
  const toShell: Array<{ channel: ChannelKey; message: unknown }> = [];
  const renders: Array<{ view: View; props: unknown }> = [];
  const unmounted: Array<View> = [];
  const errorReporters: Array<(message: string) => void> = [];
  let port: MfePort | null = null;
  let shell: Shell | null = null;
  const registrar: Registrar = {
    register: (_id, p) => {
      port = p;
      return {
        deliver: (channel, message) => {
          toShell.push({ channel, message });
          return Promise.resolve({ ok: true, value: "shell got it" });
        },
      };
    },
  };
  const io: MfeSideIo<View> = {
    findRegistrar: () => registrar,
    mount: (_node, view, onError) => {
      errorReporters.push(onError);
      return {
        render: (props) => renders.push({ view, props }),
        unmount: () => unmounted.push(view),
      };
    },
  };
  registerMfe(io, "test", (s) => {
    shell = s;
    return views;
  });
  const options: DeliverOptions = { deliveryTimeout: 0, signal: null };
  const deliver = (channel: ChannelKey, message: unknown): Promise<SendResult> =>
    (port as MfePort | null)?.deliver(channel, message, options) ??
      Promise.reject(new Error("never registered"));
  return {
    deliver,
    renders,
    unmounted,
    toShell,
    errorReporters,
    shell: () => shell as Shell | null,
  };
};

const element = (): Element => ({}) as Element;

const errorOf = (result: SendResult) => result.ok ? null : result.error;

Deno.test("registering with no manager on the page throws", () => {
  assertThrows(
    () =>
      registerMfe(
        { findRegistrar: () => undefined, mount: () => ({ render() {}, unmount() {} }) },
        "x",
        () => ({}),
      ),
    Error,
    "no MFE manager",
  );
});

Deno.test("mounting renders the view with its props", async () => {
  const t = setup();
  assertEquals(await t.deliver(mountChannel, { view: "main", node: element(), props: 1 }), {
    ok: true,
    value: null,
  });
  assertEquals(t.renders, [{ view: "Main", props: 1 }]);
});

Deno.test("props sent on the mount node re-render that view only", async () => {
  const t = setup();
  const [a, b] = [element(), element()];
  await t.deliver(mountChannel, { view: "main", node: a, props: "a1" });
  await t.deliver(mountChannel, { view: "main", node: b, props: "b1" });
  await t.deliver(a, "a2");
  assertEquals(t.renders.map((r) => r.props), ["a1", "b1", "a2"]);
});

Deno.test("mounting a view that doesn't exist fails, naming the views there are", async () => {
  const t = setup({ widget: "W", editor: "E" });
  const error = errorOf(
    await t.deliver(mountChannel, { view: "nope", node: element(), props: null }),
  );
  assertEquals(error?.is, "handler-failed");
  assertStringIncludes(error?.message ?? "", `no view called "nope"`);
  assertStringIncludes(error?.message ?? "", `"widget", "editor"`);
});

Deno.test("a malformed mount message fails", async () => {
  const t = setup();
  assertEquals(errorOf(await t.deliver(mountChannel, { view: 1 }))?.is, "handler-failed");
});

Deno.test("mounting twice into one node fails", async () => {
  const t = setup();
  const node = element();
  await t.deliver(mountChannel, { view: "main", node, props: null });
  const error = errorOf(await t.deliver(mountChannel, { view: "main", node, props: null }));
  assertStringIncludes(error?.message ?? "", "already mounted");
});

Deno.test("unmounting unmounts the view and closes its channel", async () => {
  const t = setup();
  const node = element();
  await t.deliver(mountChannel, { view: "main", node, props: null });
  await t.deliver(unmountChannel, { node });
  assertEquals(t.unmounted, ["Main"]);
  assertEquals(errorOf(await t.deliver(node, "late props"))?.is, "channel-closed");
});

Deno.test("unmounting a node with nothing mounted is harmless", async () => {
  const t = setup();
  assertEquals((await t.deliver(unmountChannel, { node: element() })).ok, true);
});

Deno.test("a render error is sent to the shell on the view's mount node", async () => {
  const t = setup();
  const node = element();
  await t.deliver(mountChannel, { view: "main", node, props: null });
  t.errorReporters.at(0)?.("it broke");
  assertEquals(t.toShell, [{ channel: node, message: { renderError: "it broke" } }]);
});

Deno.test("the MFE's code can send the shell messages and receive its own", async () => {
  const t = setup();
  const shell = t.shell();
  assertEquals(await shell?.send({ channel: "save", message: 1 }), {
    ok: true,
    value: "shell got it",
  });
  shell?.receive("ping", () => "pong");
  assertEquals(await t.deliver("ping", null), { ok: true, value: "pong" });
});

Deno.test("the MFE's code can't receive on the framework's channels", () => {
  const t = setup();
  assertThrows(() => t.shell()?.receive("mfe:mine", () => null), Error, "framework's own");
});
