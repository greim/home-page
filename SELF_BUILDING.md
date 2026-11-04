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
- `manifest.ts`: exports, as `manifest`, the widget's title, description, and an Effect Schema for
  its config, declared with `defineManifest` from `src/common/widgets.ts`.
- Tests, per [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md).

### The Widget Build

`deno task build-widgets` bundles every `src/client/widgets/*/main.tsx` and writes:

- `dist/widgets/<id>/main.js`: one bundle per widget, with its source map beside it.
- `dist/widgets/registry.json`: every widget's ID, title, description, a content hash of its bundle,
  and its config schema (converted from Effect Schema to JSON Schema with `JSONSchema.make`).

The build fails if a widget folder's name isn't a valid ID (lowercase letters, digits and single
hyphens), it lacks `main.tsx` or `manifest.ts`, its manifest doesn't decode, or it fails to bundle.
It reports every broken widget at once, and leaves the last good output in place. `dist/` is
gitignored. The server runs this build at startup, in its own process, so a fresh clone works, and
`deno task build` runs it too.

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
  subheading: string;
  collapsed: boolean;
  config: unknown; // decoded by the widget itself
}
```

The existing types keep their IDs (`bookmarks`, `snippets`, `form-grid`, `assistant`), so existing
layouts migrate by moving each widget's type-specific fields into `config`.

### Shell and Widget Contract

- The shell embeds a widget's `widget` view inside its card, and passes it `config` and the current
  look (skin colors, fonts, and the column's text color) as props.
- A widget saves a changed config (e.g. a bookmark folder expanded) by sending it to the shell on a
  `save-config` channel.
- In the column editor, the `editor` view is passed the draft config and reports each change, and
  whether it's valid, on a `draft-config` channel. The column editor's Save button applies it, like
  any other change.
- The add-widget menu lists widget types from the registry.
- The shell shows an error in the widget's card when its type isn't in the registry, its bundle
  fails to load, its config doesn't decode, or it throws while rendering. If a developer deletes a
  widget type the layout still uses, that's the error they get.

### Secrets

A widget that needs an API key keeps it in `localStorage`, under `widget:<id>:<name>`, and prompts
for it when it's missing. The assistant and git never see it.

### Network Access

Widgets call APIs straight from the browser. Some APIs and most RSS feeds don't allow cross-origin
requests, though. A server-side proxy for those is deferred until a widget needs one.

## How Will the Agent Write Widgets?

The assistant keeps its no-shell sandbox, but it can:

- Read the whole repo.
- Write and edit only `src/client/widgets/**` and its copy of the layout.
- Use `WebFetch` and `WebSearch`, to read API documentation.

Its prompt includes the registry (every widget type's description and config schema), in place of
looking up the layout's schema elsewhere.

When a turn ends and widget source changed, the server runs the widget build, type check, lint and
tests for `src/client/widgets/`. Then it validates the layout, including each widget's config
against its schema in the registry. This extends the check the server already runs on the layout
when a turn ends. Any failure is sent back to the agent with its output, and the agent tries again
(up to 3 times in all). When everything passes, the layout is applied to the live page. If widget
code changed, the agent asks the user to reload to pick it up.

If the user requests updates, the agent edits the source and the same check runs at the end of that
turn. Committing and opening a PR is left to the developer.

## Decoupling From Unibrain

The assistant no longer uses Unibrain. The registry tells it what widgets exist and how to configure
them. The server's checks give it diagnostics. Its Unibrain MCP config is removed, and README.md and
AI_INTEGRATION.md are updated to match.

## Phases

- Phase 1: Build the MFE framework, the widget build (bundles plus `registry.json` in `dist/`), and
  the route serving them.
- Phase 2: Prove it out with one new, trivial widget, added to the layout by hand.
- Phase 3: Move the existing widgets to MFEs, and remove widget types from the layout schema.
- Phase 4: Let the assistant create widgets: widen its write access, add web tools, put the registry
  in its prompt, run the widget checks when a turn ends, and drop Unibrain.
- Phase 5 (if needed): A server-side proxy for APIs that don't allow cross-origin requests.
