# The Self-Building Home Page

## Vision

The Home Page would be boring if it was just a portal with only 4 kinds of widgets. OTOH, if I tried
guessing which widgets users might like, I'd waste a lot of time and tokens making bad guesses.

Currently there's an _assistant_ that can build widgets for you, but it can't code new widgets; it's
limited to existing types.

What if the assistant could build new widget types? What if a user wanted a map app that connected
to a Google Maps API and plotted locations of things within a certain radius? What if a user wanted
a stock ticker or a news feed reader?

## Users Are Developers

The home page always runs on localhost, out of a git repo someone cloned. Its user is a developer,
and the assistant is just another way of developing it, the same as running Claude Code in a
terminal. A widget the assistant writes isn't user data. It's source code, committed and merged by
PR like any other change. Security is judged on that basis: the assistant may write code that runs
in the page, the same as the developer may.

## Implications: Adopt an MFE Architecture

Right now widgets are statically coded into the app. For the above idea to work, this can no longer
be the case. _Every_ widget becomes a Micro-Frontend (MFE), including the existing four. The MFE
framework is defined in [MFE_FRAMEWORK.md](./MFE_FRAMEWORK.md).

### Widget Source

Each widget is a folder, `src/client/widgets/<id>/`, whose name is the widget type's ID. It
contains:

- `main.tsx`: the entry point. Calls `registerMfe("<id>", …)` and provides two views:
  - `widget`: the widget's body, as shown in a column.
  - `editor`: the widget's settings form, shown in the column editor in admin mode.

  A widget may provide more views for the app to embed elsewhere.
- `manifest.ts`: exports, as `manifest`, the widget's title, description, an Effect Schema for its
  config, and the config a new widget starts with, declared with `defineManifest` from
  `src/common/widgets.ts`.
- Tests, per [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md).

Widgets build their views with the kit in `src/client/widget-kit/`. `widgetView` and `editorView`
decode a view's props with the widget's config schema, show what's wrong if they don't decode, and
render the view with Chakra set up as the shell has it (`src/client/chakra-system.ts`). The kit also
has small pieces editors share, such as labels and row controls.

### The Widget Build

`deno task build-widgets` bundles every `src/client/widgets/*/main.tsx` and writes:

- `dist/widgets/<id>/main.js`: one bundle per widget, with its source map beside it.
- `dist/widgets/registry.json`: every widget's ID, title, description, a content hash of its bundle,
  its config schema (converted from Effect Schema to JSON Schema with `JSONSchema.make`), and its
  default config (encoded with its schema, as it's saved in the layout).

The build fails if a widget folder's name isn't a valid ID (lowercase letters, digits and single
hyphens), it lacks `main.tsx` or `manifest.ts`, its manifest doesn't decode, its default config
doesn't fit its schema, or it fails to bundle. It reports every broken widget at once, and leaves
the last good output in place. `dist/` is gitignored. The server runs this build at startup, in its
own process, so a fresh clone works, and `deno task build` runs it too.

### Serving Widgets

`dist/widgets/` is served under `/web/assets/widgets/`, read from disk on each request (unlike the
client bundle, which is kept in memory), so a rebuild is picked up without restarting the server.
The shell fetches `registry.json` when it loads. The manager's resolver turns an ID into
`/web/assets/widgets/<id>/main.js?v=<hash>`, using the hash from the registry, so a reload never
gets a stale bundle from cache.

### The Layout Schema

The layout schema no longer lists widget types. A widget in the layout is:

```ts
{
  id: string; // this instance
  is: string; // the widget type's ID, e.g. "bookmarks"
  config: unknown; // decoded by the widget itself
}
```

The shell draws no heading of its own (see [NEW_LAYOUT.md](./NEW_LAYOUT.md)): a widget that wants
one draws it, from its config. By convention that's a `heading` string, which admin mode also names
the widget by (`widgetHeading` in `src/common/model.ts`); bookmarks also has `collapsed`. Widgets
saved with the shell's old `subheading` and `collapsed` get them moved into `config` as `heading`
and `collapsed`; types that don't use them ignore them.

The existing types keep their IDs (`bookmarks`, `snippets`, `form-grid`, `assistant`). A layout
saved before widgets were MFEs is migrated as it's read: each widget's type-specific fields move
into `config`. So is phase 2's interim shape, `{ is: "mfe", mfe: "<type id>", config, ...}`. Either
way, it's saved in the current shape next time.

### Shell and Widget Contract

Props cross between bundles as they are, functions included (see
`src/client/widget-kit/contract.ts`). The config in them is JSON, as saved in the layout. The kit
decodes it with the widget's schema and encodes it again before handing it back.

- The shell embeds a widget's `widget` view inside its card, with props
  `{ widgetId, config,
  saveConfig }`. A widget saves a changed config (e.g. a bookmark folder
  opened) by calling `saveConfig`.
- In the column editor, the shell embeds the selected widget's `editor` view, with props
  `{ widgetId,
  config, reportDraft }`. `config` is where to start from; the editor owns its state
  from then on. It calls `reportDraft` with `{ ok: true, config }` or `{ ok: false, errorMessage }`
  when it opens and after each change. The column editor's Save button applies the latest valid
  drafts, like any other change, or shows the first error. A widget whose editor never opened is
  saved unchanged.
- The look isn't passed as props. A widget's DOM sits inside its column, so it inherits the column's
  text color and fonts (monospace), and Chakra's light or dark tokens through CSS, as the built-in
  widgets did.
- The add-widget menu lists widget types from the registry. A new widget gets its type's default
  config.
- Each widget sits in its own section of the column, divided from the one above it. Widgets that
  have a heading style it with `widgetHeading` from `src/client/surface.ts`, so they match.
- The shell shows an error in the widget's card when its type isn't in the registry, its bundle
  fails to load, its config doesn't decode, or it throws while rendering. If a developer deletes a
  widget type the layout still uses, that's the error they get.

The assistant is only a widget: the page has no other way in to it. Its conversations, one per
assistant widget, live in its bundle for the life of the page, so each widget keeps its own while
its column is being edited. When it applies a layout, it sends it to the app on a `layout-applied`
channel, for the page to show.

### Secrets

A widget that needs an API key keeps it in `localStorage`, under `widget:<id>:<name>`, and prompts
for it when it's missing. The assistant and git never see it.

### Network Access

Widgets call APIs straight from the browser. Some APIs and most RSS feeds don't allow cross-origin
requests, though. A server-side proxy for those is deferred until a widget needs one.

## How Will the Agent Write Widgets?

The assistant keeps its no-shell sandbox (`--restricted`, `--permission-mode dontAsk`; see
`src/server/assistant-agent.ts`), but it can:

- Read the whole repo, except `.secrets/`.
- Write and edit only `src/client/widgets/**` and its copy of the layout.
- Use `WebFetch` and `WebSearch`, to read API documentation.

Its prompt lists the registry (every widget type's title, description, config schema and default
config), read afresh for each run of the agent, in place of looking up the layout's schema
elsewhere. It points the agent at this document, ENGINEERING_STANDARDS.md and the existing widgets
for how to write one.

When a turn ends, the server checks the agent's work (`src/server/widget-checks.ts`):

- If any file under `src/client/widgets/` changed since it last passed, the server runs, in order,
  `deno fmt`, `deno check`, `deno lint` and `deno test` on that folder, then the widget build. It
  stops at the first failure. The build comes last, so the page only ever gets code that passed.
- If the layout changed, or widget code did (which may change a config's schema), it runs
  `bin/check-layout.ts` on the agent's layout: its shape, plus each widget's config decoded with its
  type's schema from the manifest. That runs in its own process, so it sees the current manifests.

Each step is a `deno` command run in the repo; output saying something passed is dropped, and the
rest is trimmed to its end. Any failure is sent back to the agent, and the agent tries again (up to
3 times in all). When everything passes, the layout is applied to the live page. If widget code
changed, the agent asks the user to reload to pick it up. If it still fails after 3 tries, nothing
is applied and the user is told the failing code is still in `src/client/widgets/`.

If the user requests updates, the agent edits the source and the same check runs at the end of that
turn. Committing and opening a PR is left to the developer.

## Decoupling From Unibrain

The assistant no longer uses Unibrain, or any MCP server. The registry tells it what widgets exist
and how to configure them. The server's checks give it diagnostics.

## Phases

- Phase 1: Build the MFE framework, the widget build (bundles plus `registry.json` in `dist/`), and
  the route serving them.
- Phase 2: Prove it out with one new, trivial widget, added to the layout by hand.
- Phase 3: Move the existing widgets to MFEs, and remove widget types from the layout schema.
- Phase 4: Let the assistant create widgets: widen its write access, add web tools, put the registry
  in its prompt, run the widget checks when a turn ends, and drop Unibrain.
- Phase 5 (if needed): A server-side proxy for APIs that don't allow cross-origin requests.
