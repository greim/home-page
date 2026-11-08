# The MFE framework in detail

The rules `src/client/mfe/` implements, and how it's built. The overview is in [SKILL.md](SKILL.md).

## Loading and registration

- The manager loads a bundle with a dynamic `import()` of the URL the resolver returns.
- The bundle can't import the manager, so the manager makes itself reachable under a well-known
  global, `Symbol.for("mfe-manager")`. That's how `registerMfe` finds it.
- When it loads, the bundle must call `registerMfe` exactly once, with the ID it was loaded under.
  Not registering, registering twice, or registering under another ID is a load failure.
- A bundle is loaded at most once per page. Picking up a rebuilt bundle takes a page reload.

## Views

- Views are React components, but the shell never renders them. The MFE's half renders them with the
  React the MFE imports, using `createRoot` from that `react-dom`, into a mount node the embedder
  provides. Each view is a separate React root either way, so React context doesn't cross.
- Each time the embedder mounts, it creates a fresh mount node inside its own element. A node (and
  so a channel) is never reused, even when StrictMode mounts twice.
- When the embedder unmounts, it tells the MFE to unmount that root, and removes the node.
- An error thrown while a view renders is caught by an error boundary on the MFE side, reported to
  the embedder, and shown in place of the view.

## Messages

- Messages and replies are typed `unknown`; senders and receivers narrow them with Effect Schema.
- They're never JSON-serialized. Memory references survive the trip, so any value can be sent.
- Every message flows over a channel, which tells kinds of messages apart. A channel is a map key:
  `type ChannelKey = string | Node`.
- An MFE can message the shell any time: if the MFE is running, so is the shell.
- The shell can message an MFE any time, without knowing whether it exists or has loaded. If it
  hasn't loaded, the manager loads it first, then delivers. The shell just waits a little longer.
- Any message can fail, but the promise never rejects. It resolves to a result saying whether the
  message succeeded and, if not, why (see Results).
- Embedding is messaging on two channels the framework keeps for itself, `mfe:mount` and
  `mfe:unmount`. Apps can't use channels starting `mfe:`. The embedder sends the view's name, its
  mount node and its props on `mfe:mount`, which loads the MFE as a side effect. `registerMfe` sets
  up the listeners that render and unmount views.
- Prop updates go to the mount node's channel, so each reaches only its own embedded instance: both
  sides hold a reference to the node, and it's unique.

## Delivery

A message may be sent before its recipient has a handler, e.g. one registered in a `useEffect`.
Delivery follows the actor model, like Erlang/OTP mailboxes: messages wait for a handler instead of
failing, but a sender never waits forever unless it asks to.

- **One handler per channel.** `receive` returns a function that removes the handler. Registering a
  second handler on a channel throws, since each message gets exactly one reply. That's a
  programming error, so it's a true exception, not a result.
- **Messages are buffered.** A message to a channel with no handler is queued, and delivered in
  order when a handler registers.
- **Delivery times out.** If no handler takes a message within `deliveryTimeout` ms, the result is a
  `no-handler` failure. Only delivery is timed: once a handler has the message, how long it takes is
  up to the app.
  - The default is 5000.
  - `0` means a handler must already exist.
  - `Infinity` waits as long as it takes.
  - For an MFE that isn't loaded yet, the clock starts once it has loaded. Load failures have their
    own errors.
- **Senders can abort.** `signal` is an `AbortSignal` covering the whole conversation, the handler's
  work included. Aborting resolves the result as an `aborted` failure and removes the message from
  the queue if it's still waiting. `AbortSignal.timeout(n)` sets an overall deadline; aborting in an
  effect's cleanup gives up when a component unmounts.
- **Channels can close.** A mount-node channel lives as long as its embedded view. When the embedder
  unmounts, the channel closes: messages still queued on it, and any sent afterwards, fail at once
  with `channel-closed`. String channels never close.
- **Register early to avoid races.** Handlers registered inside the `registerMfe` factory exist
  before the manager treats the MFE as loaded, so messages to them can't arrive too early. Prefer
  that over registering handlers in components.

## Results

`send` resolves to a discriminated union, so callers branch on it instead of catching rejections
(the `effect-errors` skill):

```ts
type SendResult =
  | { ok: true; value: unknown } // the reply, to decode with Effect Schema
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

The load failures (`not-found`, `network`, `resolver`, `registration`) only reach the shell, since a
running MFE has already loaded. Once an MFE fails to load, every later message to it gets the same
failure until the page reloads.

Handlers are plain functions returning a value or a promise of one. A throw or rejection becomes a
`handler-failed` failure for the sender.

## How it's built

The internals follow the `functional-core` skill, written with Effect. The public API, and
everything that passes between the shell's and an MFE's halves, is plain TypeScript.

### The core

The manager (`manager.ts`) and its mailboxes (`mailbox.ts`) are logic modules. Loading,
registration, buffering, timeouts, aborting and closing channels are all decisions, made over a few
I/O pipes:

- **Pure state transitions** are plain functions, each tested directly: an MFE's load state
  (`unloaded`, `loading`, `loaded`, `failed`) and a channel's state (its handler, its queue, or
  `closed`).
- **Orchestration** is Effect. A buffered message is a `Deferred` waiting for a handler,
  `deliveryTimeout` is `Effect.timeout`, and aborting interrupts the sender's fiber. The failure
  kinds are tagged errors (`errors.ts`), so the compiler checks each is handled. They become
  `SendResult` only at the public API.
- **Time comes from Effect's `Clock`**, so tests of timeouts and buffering run on `TestClock`, with
  no patched `setTimeout`.

### The I/O pipes

A `ManagerIo` service (a `Context.Tag`) of dumb pipes: calling the resolver, a dynamic `import()`, a
`HEAD` probe to tell a 404 from other load failures, and installing the registrar under
`Symbol.for("mfe-manager")`. On the MFE side (`register.ts`), pipes render and unmount views,
wrapping the MFE's own `createRoot`.

### The shell

`manager-live.ts` and `register-live.tsx` wire in the real pipes. The manager's integration test
bundles a small test MFE (`tooling/fixtures/widgets/echo/`) into a temporary directory, loads it
with a real `import()`, and exchanges messages with it. Rendering needs a browser, so `MfeView` and
the MFE-side render wrapper stay thin plain React, covered by the app's browser tests.

### Copies of Effect and React

The framework doesn't care whether an MFE bundles its own Effect and React or imports the shell's
through the page's import map. The home page shares them (see the skill's "Shared packages"), but
the framework must keep working for an MFE that doesn't. Effect keeps global state per copy, so an
Effect value, fiber or schema made by one copy must never be run by another. So everything crossing
between the halves stays plain: functions, promises, `AbortSignal`s and values (`protocol.ts`). Each
half uses Effect inside and converts at its edge.

### What isn't Effect

- `send` and `receive`, which are called mostly from React components. An Effect-returning variant
  can be added when Effect-based logic needs one.
- `MfeView` and the MFE-side render wrapper, which are React components.
