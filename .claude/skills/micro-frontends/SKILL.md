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
- Payload bloat from each MFE bundling its own copies of shared dependencies. (The home page avoids
  this by sharing them: see "Shared packages" below.)
- Keeping the user experience consistent across independent MFEs takes deliberate effort.
- **The contract is the hard part.** The API between the shell and MFEs must be right _early_, since
  changing it can break every MFE that depends on it. Keep it minimal, and choose its opinions
  carefully. Treat any change to `src/client/mfe/protocol.ts` or `src/client/widget-kit/contract.ts`
  as a breaking change for every widget.
  - **So a widget task doesn't change the framework.** Building or changing a widget never touches
    `protocol.ts`, `contract.ts`, the server's routes (`src/server/routes.ts`) or the page's entry
    point (`src/client/main.tsx`), and never adds a view name the page doesn't already show. If a
    widget seems to need one of those, stop and ask the developer: it's a change to the framework
    every widget shares, to design on its own, not a detail of one widget.
  - **Widget APIs are part of the contract too.** When a widget needs the app's server, it uses a
    widget API (see the `widget-apis` skill). Adding or changing one is its own task, with the
    developer's go-ahead, following that skill's recipe.

Here, the payoff is that the page can grow widget types nobody planned for: the assistant (or the
developer) writes a new widget folder, and the page loads it without the page's code changing.

## The framework

Two halves: one imported by the shell, and one imported by each MFE and bundled into it.

- **The shell** is what loads into the browser at the URL. It knows nothing at load time about which
  MFEs exist and has no static dependency on any of them. It loads an MFE's bundle only when
  something wants to render it or message it.
- **An MFE** is a whole separate app: an ES module bundle. It may carry its own copies of React and
  its other dependencies, or import ones the shell provides (the home page's widgets do). Either
  way, React context and props don't cross the boundary; anything an MFE needs from the shell
  (props, data) arrives as messages.

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

  - `full-screen` (optional): the widget with room to spread out. See "Full-screen views" below.

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
- `TextBox` is a text box styled for a column, and `TextBoxButton` the solid black button for the
  row under it, as Paste as Markdown and Grammar Check use.
- `Label`, `RowControls` and `nudge` are small pieces editors share.

### The contract (`src/client/widget-kit/contract.ts`)

- **`widget` view** props: `{ widgetId, config, saveConfig, schedule }`. Call `saveConfig` to save a
  changed config (e.g. a bookmark folder opened). `schedule` is when the user's day starts and ends,
  and their weekend; `src/common/day-cycle.ts` says what any moment is by it.
- **`widget` view** also gets `openFullScreen()`, which opens its `full-screen` view (if it has one)
  as a modal. Call it only from a user action, such as a button's click.
- **`full-screen` view** props: the `widget` view's, less `openFullScreen`.
- **`widget` and `full-screen` views** also get `apis`: a client for each widget API the manifest
  declares, built by the page for that widget. The kit's `widgetView` and `fullScreenView` move it
  into React context, for `useWidgetApi`, so components don't see it as a prop. The `editor` view
  doesn't get it: it loads before the user consents.
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
- The page draws a rule (a groove) between widgets in a column. A widget that ends in an edge of its
  own, like the RSS feed's sunk list of headlines, says `ruleBelow: false` in its manifest, and the
  page leaves out the rule under it (the space stays). It can't drop the rule above it.

### Full-screen views

A column is narrow. When a widget needs room (a big table, a chart, a reader, a form with many
fields), give it a `full-screen` view as well, and a button in its `widget` view that calls
`openFullScreen`. Build it with `fullScreenView(schema, Component)` from the kit, and register it as
`"full-screen"`. It gets the same props as the widget view (less `openFullScreen`), so it can read
and save the same config.

The page shows every full-screen view the same way (`src/client/full-screen/`), its own included:
the assistant, the settings and the column editor.

- **It opens as a modal** over the page, centered, with the page dimmed behind it. Clicking the dim
  part, pressing Escape, or the ✕ closes it, discarding anything unsaved.
- **One modal at a time.** The page behind it can't be clicked, so nothing else opens one. Views
  don't open other full-screen views.
- **Tearing off.** Where the browser has Document Picture-in-Picture (Chrome, Edge, Firefox), the
  modal has a button that moves its view into a picture-in-picture (PiP) window of its own, floating
  over other windows. That frees the page for another modal, so at most two views are open at once.
  There's one PiP window at most: tearing off another view replaces it.
- **Pulling back.** The PiP window has a button to bring its view back as a modal, shown while no
  modal is open. Opening the same view from the page does the same.
- **State survives the move.** The view's DOM moves between the modal and the window; it isn't
  remounted, so drafts and scroll position survive. The kit restyles it for the window's document.
- **Filling it.** The view is given the whole area under the frame's title bar: give its root
  `h="full"` (not `100vh`, which is the page's height, not the modal's) and let its own parts
  scroll. The frame shows the widget's name as its title, so the view needn't repeat it.
- **Its size.** It opens as big as the window, unless the manifest says otherwise with
  `fullScreen: { width, height }`: `width` in rem (the page's unit, so 52 is about half the window's
  width) or `"full"`, and `height` `"full"` or `"fit"` (as tall as its content, at most the
  window's). Give one when the view doesn't need the whole window: a chat or a single form is hard
  to read stretched across it. The grammar checker (72, full) and the page configurator (52, full)
  do. It's the modal's starting size in a PiP window too.
- **Sizing inside it.** The modal is the page's: 1rem is 1vw. In a PiP window, 1rem is the browser's
  default 16px, and the view reflows as the window is resized. So lay a full-screen view out to
  reflow (flex, grid, wrapping), not to fixed widths.

Anything relying on being inside a column doesn't work in a full-screen view: `--column-background`
and the column's text color aren't there. It's drawn in the page's normal light or dark colors.

#### Never open the app, or a widget, in another tab

When a widget needs more room, or a window of its own, give it a full-screen view. Don't open the
app's own pages in a new tab or window: no `window.open` (or `target="_blank"` link) to a URL this
server serves, no new route serving the page, no second mode of the page's entry point that shows
one widget. Why:

- **It's a second copy of the app,** with its own copy of the layout. The page saves the whole
  layout at once and the last save wins, so two copies silently undo each other's changes.
- **A widget gets everything from the page,** as props: its config, `saveConfig`, its `widgetId`,
  the schedule. A tab of its own has no page to give it those, so the widget has to invent its own
  storage and identity (one shared `localStorage` key, say), which two tabs then overwrite without
  either knowing, and which every widget of that type shares.
- **It changes the framework** (a route, an entry point, a view name), which belongs to every
  widget, from inside one widget's task (see "The contract is the hard part").
- **A full-screen view already does what the tab was for.** It has the whole screen, and torn off,
  it's a window of its own that floats over other windows, while sharing the page's live state:
  saving from it saves the layout the page shows.

If the user asks for a widget "in a new tab" or "on its own page", build a full-screen view, and say
why in a sentence or two: it opens over the page, and its button moves it into a window of its own.
If they still want a separate tab, stop and ask before building anything: hosting widgets in
separate tabs needs the layout to be safe to save from several at once, which is framework work.

This is only about the app's own pages. Links to other sites open in new tabs as usual (bookmarks
do).

### In the layout

A widget in `layout.json` is `{ id, is, config }`: `is` names its type's folder, and `config` is
whatever that type's schema says. The layout schema doesn't list widget types. Shapes saved before
widgets were MFEs are migrated as they're read (`migrateWidget` in `src/common/model.ts`).

### The widget build

`deno task build-widgets` (also part of `deno task build`, and run by the main server at startup)
bundles every `src/client/widgets/*/main.tsx` into `dist/widgets/<id>/main.js` and writes
`dist/widgets/registry.json`: each widget's ID, title, description, a hash of its bundle, its config
schema as JSON Schema, its default config, and the outside services it sends data to (`permissions`,
or null). The page reads `permissions` from the registry, so it can ask the user before showing the
widget. It fails, reporting every broken widget at once and leaving the last good output in place,
if a folder's name isn't a valid ID, it lacks `main.tsx` or `manifest.ts`, its manifest doesn't
decode, its default config doesn't fit its schema, or it doesn't bundle.

### Shared packages

The page bundles one copy of React, React DOM, Effect, Chakra UI and Emotion, and every widget
imports those instead of carrying its own. Without this each widget bundle was about 900 KB, nearly
all of it the same libraries; now each is under 20 KB, and the widget build is several times faster.

- **The list** is `sharedModules` in `src/common/shared-modules.ts`: exactly these names, and no
  other part of these packages, are shared: `react`, `react/jsx-runtime`, `react-dom`,
  `react-dom/client`, `effect`, `@chakra-ui/react` and `@emotion/react`.
- **The widget build** marks those names external, so a widget's bundle keeps
  `import … from
  "react"` as it is. Everything else a widget imports (e.g. `react-icons/lu`) is
  still bundled into it, tree-shaken to what it uses.
- **The page** bundles `src/client/main.tsx` together with one module per shared name,
  `src/client/shared/<entry>.ts`, with code splitting on. So the page and the shared modules use the
  same chunks, and so the same single copy of each package. They're served at
  `/web/assets/shared/<entry>.js`, and the page's import map (in `src/server/routes.ts`) points each
  name there, so `import("react")` in a widget gets the page's React.
- **Shared modules are whole packages.** Nothing knows in advance what widgets will use, so they
  can't be tree-shaken: the page's JavaScript grew by about 1.2 MB, which already pays for itself
  with two widgets.
- **CommonJS packages** (React and React DOM) can't be re-exported with `export *`: the bundled
  module would export nothing. Their shared modules list every export instead, and a test in
  `tooling/bundle-client.test.ts` checks each shared module exports exactly what its package does.
  After upgrading React, if that test fails, update the lists from its diff.
- **The build enforces the rules.** It fails a widget whose bundle carries its own copy of a shared
  package (e.g. it imported `effect/Schema` or `react-dom/server`, which aren't shared), found from
  its source map, or that has CommonJS code `require()`ing a shared package, which would throw in
  the browser.
- **Versions always match**, the usual problem with sharing between MFEs: the page and the widgets
  are built from the same `deno.json` and lockfile. After changing a shared package's version,
  restart the server (so the page is rebundled) as well as rebuilding the widgets.

To share another package, add it to `sharedModules`, add its module in `src/client/shared/`, and
check the test still passes. Share a package only when most widgets use it.

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

- Call outside APIs straight from the browser, if they allow cross-origin requests.
- Use the app's server through widget APIs (`useWidgetApi`, declared under `apis` in the manifest),
  never by `fetch`ing its routes. See the `widget-apis` skill.
- Send the user's data to an outside service only if the manifest declares it under `permissions`.
  The page then shows neither its `widget` nor its `full-screen` view until the user agrees. Its
  `editor` does load before that, so the editor, and anything that runs when the bundle loads, must
  never call a service. See "Sending data to outside services" in the `code-vs-data` skill.
- Keep secrets such as API keys in `localStorage`, prompting for them when missing, and never in
  their config. See the `code-vs-data` skill.
- Use Claude for one task through an agent of their own, with only the capabilities it declares
  (web, files, its own tools, MCP servers; each auto or ask) and a declared answer. See the
  `widget-agents` skill.
- Use React, Chakra and Effect freely: they're the page's shared copies, so they cost a widget
  nothing. Import them only by the shared names (see "Shared packages"); the build rejects anything
  else from those packages.
