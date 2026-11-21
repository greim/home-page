---
name: ephemeral-state
description: Layout.json holds only deliberate configuration, never ephemeral UI state (open/closed, selected tab, scroll, drafts); that lives in localStorage. Use when a widget needs to remember something the user did by clicking around, or when deciding what goes in a widget's config.
---

# Ephemeral state stays out of layout.json

`data/layout.json` is the page's _configuration_: what the user chose to build. It is versioned
(every change to it is a thing the user can review, accept, discard or undo), so a change to it must
mean "the user changed their page", never "the user clicked around".

## The rule

A widget's `config` (and everything else in the layout) holds only settings the user set on purpose,
through the editor, admin mode or the assistant. It never holds state that changes as a side effect
of using the page:

- whether a list, folder, panel or section is open or closed
- the selected tab, sort order or filter
- scroll position, the last item viewed, a draft someone is typing
- anything you'd expect to be forgotten if the user cleared their browser

That state goes in the browser's `localStorage`, keyed by the widget's id (`widgetId` is in every
view's props), e.g. `bookmarks:<widgetId>:open`.

The test: _would the user expect "Review changes" to show this?_ If opening a folder made the layout
look modified, it's in the wrong place.

## How

- Keep the parsing, defaults and transitions in a pure module with tests (see `functional-core`),
  e.g. `bookmarks/open-state.ts`.
- Wrap the storage in a small `*-live.ts` module: an in-memory map shared by every view in the
  bundle, `useSyncExternalStore` for React, and `try`/`catch` around `localStorage` (it can be
  unavailable; the state then lasts until the page reloads). `web-researcher/history-live.ts` and
  `bookmarks/open-state-live.ts` are the pattern.
- Decode what you read defensively: unknown, malformed or stale values fall back to the default.
- Pick defaults so a fresh browser looks right with nothing stored (bookmarks: list open, folders
  closed).
- State refers to things by id. If the user can edit the things (rename, reorder), make sure their
  ids survive the edit, or the state is orphaned.
- Don't add such fields to a config schema "for the initial state". If a widget needs a deliberate
  starting state, that's a real setting with a name that says so, set in its editor.
- Never call `saveConfig` from a click that is just navigating the widget. `saveConfig` is for
  settings.

State in `localStorage` is per browser: it isn't shared between devices or visible to the assistant.
That's the point.
