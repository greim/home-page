---
name: micro-frontends
description: Micro-frontends (MFEs) in general, this repo's own MFE framework (src/client/mfe/), and how the home page builds every widget as an MFE. Use when writing or changing a widget, its manifest, editor or views, touching the widget build, registry or kit, sending messages between the page and a widget, or changing the framework itself.
---

# Micro-frontends

The home page implements its widgets as micro-frontends (MFEs). The MFE framework is custom-built,
lives in `src/client/mfe/`, and assumes React. It's fully generic: it knows nothing about widgets,
columns or layouts. The widget-specific layer sits on top of it.

## What MFEs are

An MFE architecture breaks a web app into smaller, independent, loosely coupled frontend apps that
are developed and deployed independently, but presented to the user as one cohesive experience.

An MFE is not a configuration file the host reads and renders. It's _executable code_: a `.js` file
loaded off the server. When it runs, it talks to the host through a shared API contract, to render
views or provide other services inside the host. That's what makes MFEs flexible.

**Benefits:**

- **Autonomy and ownership.** Each MFE is owned end to end, and its code boundary matches its
  owner's, so there are fewer merge conflicts and no "tragedy of the commons" code.
- **Faster onboarding.** You only need to understand the MFE you're working on, not the whole app.
- **Independent deployment.** An MFE ships without the host or other MFEs shipping.
- **Incremental upgrades.** Old parts can be replaced one MFE at a time instead of all at once.
- **Fault isolation.** A crash in one MFE doesn't take down the page; the rest stays interactive.

**Risks:**

- More moving parts and operational overhead.
- Payload bloat from each MFE bundling its own copies of shared dependencies.
- Keeping the user experience consistent across independent MFEs takes deliberate effort.
- **The contract is the hard part.** The API between the shell and MFEs must be right _early_, since
  changing it can break every MFE that depends on it. Keep it minimal, and choose its opinions
  carefully. Treat any change to `src/client/mfe/protocol.ts` or `src/client/widget-kit/contract.ts`
  as a breaking change for every widget.

Here, the payoff is that the page can grow widget types nobody planned for: the assistant (or the
developer) writes a new widget folder, and the page loads it without the page's code changing.

## The framework

Two halves: one imported by the shell, and one imported by each MFE and bundled into it.

- **The shell** is what loads into the browser at the URL. It knows nothing at load time about which
  MFEs exist and has no static dependency on any of them. It loads an MFE's bundle only when
  something wants to render it or message it.
- **An MFE** is a whole separate app: an ES module bundle with its own copies of React and its other
  dependencies. React context and props don't cross the boundary; anything an MFE needs from the
  shell (props, data) arrives as messages.

The framework provides:

- **A manager** (`createManager`, `src/client/mfe/manager-live.ts`): a singleton the shell creates
  once, in its entry point, for the life of the page. It loads bundles on demand and coordinates
  between the shell and loaded MFEs.
- **A registration function** (`registerMfe`, `src/client/mfe/register-live.tsx`): an MFE calls it
  in its entry point to register with the manager and declare its views.
- **A React embedder** (`MfeView`, `src/client/mfe/mfe-view.tsx`): embeds any MFE's view anywhere in
  the shell, any number of times.
- **Messaging**: the shell and MFEs send each other messages, each a two-way conversation that
  resolves to a reply. MFEs _cannot_ message other MFEs.

```ts
// The shell's entry point. The resolver turns an MFE's ID into its bundle's URL;
// include a version so a rebuilt bundle isn't served from cache.
const manager = createManager({ resolver: (id) => `/bundles/${id}/main.js?v=${versionOf(id)}` });

// An MFE's entry point. Each view gets `{ props: unknown }`, to decode with Effect Schema.
registerMfe("my-mfe", (shell) => ({ view1: MyComponent1, view2: MyComponent2 }));
```

```tsx
// Embedding a view in the shell. `fallback` shows if the view can't be shown.
<MfeView
  manager={manager}
  mfe="my-mfe"
  view="view1"
  props={{ some: "props" }}
  fallback={(message) => <ErrorNotice message={message} />}
/>;
```

```ts
// Messages. `send` never rejects: it resolves to { ok: true, value } or { ok: false, error }.
const result = await manager.send({ mfe, channel, message }); // shell → MFE (loads it if need be)
const unsubscribe = manager.receive(mfe, channel, (message) => reply); // shell handles MFE messages
await shell.send({ channel, message }); // MFE → shell
shell.receive(channel, (message) => reply); // MFE handles shell messages

// Delivery options, on either side:
await manager.send({ mfe, channel, message }, {
  deliveryTimeout: 0, // a handler must already exist (default 5000 ms; Infinity waits)
  signal: AbortSignal.timeout(30_000), // give up on the whole conversation
});
```

The essentials:

- Messages and replies are `unknown`, narrowed with Effect Schema. They're never serialized, so any
  value, functions included, can be sent.
- A channel is `string | Node`. Channels starting `mfe:` are the framework's own.
- One handler per channel; a second `receive` on the same channel throws.
- Messages to a channel with no handler wait in a queue until one registers or `deliveryTimeout`
  passes. Register handlers inside the `registerMfe` factory, not in components, so they exist
  before any message can arrive.
- A view's mount node is its channel, so prop updates reach only that instance. It closes when the
  view unmounts.
- Every failure (load, registration, missing view, render error, no handler, abort) is a result, not
  a rejection. `MfeView` shows them in place of the view.
- Picking up a rebuilt bundle takes a page reload: each bundle is loaded at most once per page.

For the full rules (loading and registration, views, delivery, the `SendError` kinds) and how the
framework is built, read [framework.md](framework.md) before changing anything in `src/client/mfe/`.

## How the home page uses it

Every widget type, built-in or new, is an MFE. The page is the shell.

### A widget's source

Each widget is a folder, `src/client/widgets/<id>/`, whose name is the widget type's ID (lowercase
letters, digits and single hyphens). It contains:

- `main.tsx`: the entry point. It calls `registerMfe("<id>", …)` with two views:
  - `widget`: the widget's body, as shown in its column.
  - `editor`: its settings form, shown in the column editor in admin mode.

  It may provide more views for the page to embed elsewhere.
- `manifest.ts`: exports `manifest`, declared with `defineManifest` from `src/common/widgets.ts`: a
  title, a description, an Effect Schema for its config, and the config a new widget starts with.
- Its logic modules and their tests, per the `functional-core` and `testing` skills.

To create a widget, follow the `create-widget` skill, which has the steps and templates.

### The widget kit

Build views with `src/client/widget-kit/`, not with bare components:

- `widgetView(schema, Component)` and `editorView(schema, Component)` decode a view's props with the
  config schema, show what's wrong if they don't decode, and render inside Chakra set up as the page
  has it (`src/client/chakra-system.ts`). `customView(decode, Component)` does the same for any
  other view.
- `useNow` re-renders each minute, for widgets that show the time.
- `Label`, `RowControls` and `nudge` are small pieces editors share.

### The contract (`src/client/widget-kit/contract.ts`)

- **`widget` view** props: `{ widgetId, config, saveConfig, schedule }`. Call `saveConfig` to save a
  changed config (e.g. a bookmark folder opened). `schedule` is when the user's day starts and ends,
  and their weekend; `src/common/day-cycle.ts` says what any moment is by it.
- **`editor` view** props: `{ widgetId, config, reportDraft }`. `config` is where to start; the
  editor owns its state from then on. Call `reportDraft` with `{ ok: true, config }` or
  `{ ok: false, errorMessage }` when it opens and after each change. The column editor's Save
  applies the latest valid drafts or shows the first error. An editor with nothing to edit still
  reports its config once, on open.
- Config crosses as JSON, as saved in the layout. The kit decodes it with the widget's schema and
  encodes it again before handing it back.
- The look isn't passed. A widget's DOM sits inside its column, so it inherits the column's text
  color and fonts, and Chakra's light or dark tokens through CSS. Don't hardcode colors that fight
  the column. Size everything per the `viewport-relative-design` skill.
- To tint something to match its column, derive it from the `--column-background` CSS variable
  (`columnBackgroundVar` in the contract), which the column sets to its current background and fades
  between day and night, e.g. `oklch(from var(--column-background) calc(l + 0.1) c h)`. The workday
  bar's fill does this.
- The page draws no heading. A widget that wants one draws it from its config, conventionally a
  `heading` string (which admin mode also names the widget by), styled with `widgetHeading` from
  `src/client/surface.ts` so headings match.

### In the layout

A widget in `layout.json` is `{ id, is, config }`: `is` names its type's folder, and `config` is
whatever that type's schema says. The layout schema doesn't list widget types. Shapes saved before
widgets were MFEs are migrated as they're read (`migrateWidget` in `src/common/model.ts`).

### The widget build

`deno task build-widgets` (also part of `deno task build`, and run by the main server at startup)
bundles every `src/client/widgets/*/main.tsx` into `dist/widgets/<id>/main.js` and writes
`dist/widgets/registry.json`: each widget's ID, title, description, a hash of its bundle, its config
schema as JSON Schema, and its default config. It fails, reporting every broken widget at once and
leaving the last good output in place, if a folder's name isn't a valid ID, it lacks `main.tsx` or
`manifest.ts`, its manifest doesn't decode, its default config doesn't fit its schema, or it doesn't
bundle.

`dist/widgets/` is served under `/web/assets/widgets/`, read from disk on each request, so a rebuild
needs only a page reload, not a server restart. The page fetches the registry when it loads; its
resolver (`src/client/widget-resolver.ts`) maps an ID to `…/<id>/main.js?v=<hash>`. The add-widget
menu lists the registry's types, and a new widget gets its type's default config.

**After changing widget code, run `deno task build`** (check, lint, test, then the widget build),
then reload the page.

### Failures

The page shows an error in a widget's card when its type isn't in the registry, its bundle fails to
load, its config doesn't decode, or it throws while rendering. Deleting a widget type the layout
still uses gives exactly that error; the rest of the page keeps working.

### What widgets may do

- Call APIs straight from the browser. There's no server-side proxy yet, so only APIs that allow
  cross-origin requests work.
- Keep secrets such as API keys in `localStorage`, prompting for them when missing, and never in
  their config. See the `code-vs-data` skill.
- Each widget bundles its own React, Chakra and Effect. That's fine: the page is served from
  localhost, so bundle size doesn't matter.
