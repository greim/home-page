# MFE Architecture

This document describes a Micro-Frontend (MFE) framework. All of this assumes a React architecture.
The framework is generic: it knows nothing about widgets, columns or layouts. How the home page uses
it for widgets is described in [SELF_BUILDING.md](./SELF_BUILDING.md).

## The Application Shell

The app that loads into the browser when you visit the URL. At load time, it knows nothing about
which MFEs exist, nor does it load their `.js` files. The shell has no static dependency on the MFE.
Only when something wants to render the MFE, does it load an MFE's `.js` bundle.

## MFEs

An MFE is a whole separate app. It's literally a `.js` bundle (an ES module) that can be fetched
over the web. What the bundle does when it executes is described below. The bundle includes its own
copies of React and other dependencies, which is fine because the MFE is isolated in its own bundle.

React context and props don't flow across the boundary between the shell and an MFE. The messaging
protocol below bridges that gap. Anything an MFE needs from the shell (props, theme, data) arrives
as messages.

## The MFE Framework

The MFE framework does the job of coordinating between the shell and MFEs. It has two halves: one
imported by the shell, one imported by each MFE and bundled into it. It provides the following:

- **Builds a `manager` singleton**: The shell instantiates it at startup in its entry point, and it
  persists the life of the page. Its job is to load MFE bundles on demand and execute them, and to
  coordinate between the shell and already-loaded MFEs.
- **Vends a registration function**: An MFE calls it at its entry point. It registers the MFE with
  the manager.
- **Provides a React embedder**: As part of registering, an MFE declares which views it provides
  that the shell can embed. Those views can then be embedded anywhere in the app, any number of
  times.
- **Implements a messaging protocol**: MFEs can send messages to the shell, and the shell can send
  messages to MFEs. (Note: MFEs _cannot_ send messages to other MFEs.) All messages are two-way
  conversations. You send a message and get a promise for a response. Whether you do anything with
  the response data is up to you.

**Examples:**

```ts
// Creating the manager singleton in the shell's main.tsx
const manager = createManager({
  // This teaches the manager how to turn a MFE ID
  // into a URL to the MFE's .js bundle. It can be
  // a sync or async function. Include a version in
  // the URL so a rebuilt bundle isn't served from cache.
  resolver: (id) => `/web/assets/widgets/${id}/main.js?v=${versionOf(id)}`,
});
// Mount your React app as normal. Pass `manager` to it
```

```ts
// Registering an MFE in the MFE's main.tsx
registerMfe("my-mfe", (shell) => ({
  // Use `shell` to talk to the shell. Each view is
  // given `{ props: unknown }`, to decode with Effect Schema.
  view1: MyReactComponent1,
  view2: MyReactComponent2,
  // etc...
}));
```

```tsx
// Embedding a view in the shell
<MfeView
  manager={manager}
  mfe="my-mfe"
  view="view1"
  props={{ some: "props" }}
  fallback={(message) => <ErrorNotice message={message} />} // shown if the view can't be
/>;
```

```ts
// Shell sending messages to MFEs. Never rejects; see "Results" below.
const result = await manager.send({ mfe, channel, message });
if (result.ok) {
  use(result.value);
} else {
  show(result.error.message);
}

// Shell receiving messages from MFEs. Returns a function that removes the handler.
const unsubscribe = manager.receive(mfe, channel, (message) => reply);
```

```ts
// MFE sending messages to shell. Also never rejects.
const result = await shell.send({ channel, message });

// MFE receiving messages from shell
const unsubscribe = shell.receive(channel, (message) => reply);
```

```ts
// Either side can pass delivery options (see "Delivery" below)
const result = await manager.send({ mfe, channel, message }, {
  deliveryTimeout: 0, // a handler must already exist
  signal: AbortSignal.timeout(30_000), // give up on the whole conversation after 30s
});
```

### Loading and Registration

- The manager loads a bundle with a dynamic `import()` of the URL the resolver returns.
- The manager makes itself reachable from the bundle under a well-known global
  (`Symbol.for("mfe-manager")`), since the bundle can't import it. That's how `registerMfe` finds
  it.
- When it loads, the bundle must call `registerMfe` exactly once with the ID it was loaded under.
  Not registering, registering twice, or registering under another ID is a load failure.
- A bundle is loaded at most once per page. Picking up a rebuilt bundle takes a page reload.

### Views

- Views are React components, but the shell never renders them itself. The MFE half of the framework
  renders them with the MFE's own React, using `createRoot` from the MFE's own `react-dom`, into a
  mount node the embedder provides.
- Each time the embedder mounts, it creates a fresh mount node inside its own element, so a node
  (and so a channel) is never reused, even when React's StrictMode mounts twice.
- When the embedder unmounts, it tells the MFE to unmount that root, and removes the node.
- An error thrown while a view renders is caught by an error boundary on the MFE side. It's reported
  to the embedder, which shows it in place of the view.

### More About Messages

- Messages and replies are typed `unknown`, and senders and receivers narrow them with Effect
  Schema.
- Messages and replies are never JSON-serialized. Memory references survive the trip. Any value can
  be sent.
- All messages flow over a channel, which tells different kinds of messages apart. A channel is a
  key in a map: `type ChannelKey = string | Node`.
- An MFE can send the shell a message any time. There's no worry about whether the shell exists or
  is awake. If the MFE is running it means the shell is running.
- The shell can send messages to an MFE at any time without knowing whether it exists or whether
  it's loaded. If a message is sent to an MFE that hasn't loaded yet, the manager loads it behind
  the scenes, then sends the message to it. The result is a slightly longer wait from the POV of the
  shell. If the MFE has already loaded, the manager sends the message to it directly.
- Any message can fail. The promise never rejects. It resolves to a result saying whether the
  message succeeded, and if not, why, with diagnostics. See "Results" below.
- Embedding uses messaging behind the scenes, on two channels the framework keeps for itself
  (`mfe:mount` and `mfe:unmount`; apps can't use channels starting `mfe:`). The embedder sends the
  MFE the view's name, its mount node and its props on `mfe:mount`. This loads the MFE as a side
  effect. The registration function (on the MFE side) is what sets up the listeners that render and
  unmount its views.
- Props passed to the embedder use messages behind the scenes to keep the embedded view updated.
  Each update must reach only that embedded instance, not every instance of that view. So the mount
  node is the channel, since both sides have a reference to it and it's guaranteed unique.
- Any failure the embedder sees (load, registration, missing view, render error) is shown in place
  of the view, with the diagnostics.

### Delivery

A message may be sent before its recipient has set up a handler, e.g. one registered in a
component's `useEffect`. Delivery follows the actor model, as in Erlang/OTP's mailboxes: messages
wait for a handler instead of failing, but a sender never waits forever unless it asks to.

- **One handler per channel.** `receive` returns a function that removes the handler. Registering a
  second handler on a channel that already has one throws, since each message gets exactly one
  reply. That's a programming error, so it's a true exception rather than a result.
- **Messages are buffered.** A message sent to a channel with no handler is queued, and delivered in
  order when a handler registers.
- **Delivery times out.** If no handler takes a message within `deliveryTimeout` milliseconds, the
  result is a `no-handler` failure. The timeout covers only delivery. Once a handler has the
  message, the framework stops timing, since how long a handler takes is up to the app (an assistant
  turn can take minutes).
  - The default is 5000.
  - `0` means a handler must already exist.
  - `Infinity` waits for as long as it takes.
  - For an MFE that isn't loaded yet, the clock starts once it has loaded. Load failures have their
    own errors.
- **Senders can abort.** `signal` is an `AbortSignal` covering the whole conversation, the handler's
  work included. Aborting resolves the result as an `aborted` failure, and removes the message from
  the queue if it's still waiting. `AbortSignal.timeout(n)` sets an overall deadline. Aborting from
  an effect's cleanup gives up when a component unmounts.
- **Channels can close.** A mount-node channel lives only as long as its embedded view. When the
  embedder unmounts, the framework closes the channel. Messages still queued on it, and any sent
  afterwards, fail immediately with `channel-closed`, without waiting out the timeout. String
  channels never close.
- **Register early to avoid races.** Handlers registered inside the `registerMfe` factory exist
  before the manager treats the MFE as loaded, so messages to them can't arrive too early. Prefer
  that over registering handlers in components.

### Results

`send` resolves to a discriminated union, so callers branch on it instead of catching rejections
(see [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md#error-handling)):

```ts
type SendResult =
  | { ok: true; value: unknown } // the reply, to be decoded with Effect Schema
  | { ok: false; error: SendError };

type SendError =
  & { message: string }
  & (
    | { is: "handler-failed"; cause: unknown } // the handler threw or rejected
    | { is: "no-handler" } // no handler took it within deliveryTimeout
    | { is: "channel-closed" } // its mount-node channel closed
    | { is: "aborted"; reason: unknown } // the sender's signal fired
    | { is: "not-found"; url: string } // the bundle's URL returned 404
    | { is: "network"; url: string; cause: unknown } // the bundle couldn't be fetched or executed
    | { is: "resolver"; cause: unknown } // the resolver threw or rejected
    | { is: "registration"; reason: string } // didn't register, registered twice, or under another ID
  );
```

The load failures (`not-found`, `network`, `resolver`, `registration`) only reach the shell, since
an MFE that's running has already loaded. Once an MFE fails to load, every later message to it gets
the same failure until the page reloads.

Handlers are plain functions returning a value or a promise of one. The framework turns a throw or
rejection into a `handler-failed` failure for the sender.

## Implementation

The framework's internals follow the [Functional Core pattern](./FUNCTIONAL_CORE.md), written with
Effect. Its public API, and everything that passes between the shell's and an MFE's halves, is plain
TypeScript.

### The Core

The manager is a logic module. Loading, registration, buffering, timeouts, abort and closing
channels are all decisions, made over a handful of I/O pipes:

- **Pure state transitions** are plain functions, each tested directly: an MFE's load state
  (`unloaded`, `loading`, `loaded`, `failed`), and a channel's state (its handler, queue, or
  `closed`).
- **Orchestration** is Effect. A buffered message is a `Deferred` waiting for a handler,
  `deliveryTimeout` is `Effect.timeout`, and aborting interrupts the sender's fiber. The failure
  kinds are a union of tagged errors (`Data.TaggedError`), so the compiler checks each one is
  handled. They're converted to `SendResult` only at the public API.
- **Time comes from Effect's `Clock`**, so tests of timeouts and buffering run on `TestClock`
  instead of real timers, without monkey-patching `setTimeout`.

### The I/O Interface

An `MfeIo` service (a `Context.Tag`) of dumb pipes, as in `src/client/api.ts`:

- `resolve(id)`: calls the shell's resolver.
- `importModule(url)`: a dynamic `import()`.
- The registration slot under `Symbol.for("mfe-manager")`.

On the MFE side: `render(node, view, props)` and `unmount(node)`, wrapping the MFE's own
`createRoot`.

### The Shell

A thin layer wiring in the real pipes. Its integration test bundles a small test MFE into a
temporary directory, loads it with a real `import()`, and exchanges messages with it. Rendering
needs a browser, so `MfeView` and the MFE-side render wrapper stay thin plain React, per the
standards for components, and are covered by the app's browser tests.

### Two Copies of Effect

The shell and each MFE bundle their own copy of Effect, just as they do React. Effect keeps internal
global state per copy, so an Effect value, fiber or schema created by one copy must never be run by
another. Everything that crosses between the shell's and an MFE's halves of the framework is plain:
functions, promises, `AbortSignal`s and values. Each half uses Effect internally and converts at its
edge.

Each widget bundle therefore carries the Effect runtime even if the widget itself doesn't use it.
Widgets import Effect Schema for their manifests and config anyway, and it's served from localhost,
so the size doesn't matter.

### What Isn't Effect

- `send` and `receive`. They're called mostly from React components, where Effect isn't required. An
  Effect-returning variant can be added when Effect-based logic needs one.
- `MfeView` and the MFE-side render wrapper, which are React components.
