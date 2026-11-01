# Vision

This repo contains source code for _my personal home page_.

## What Is My Personal Home Page?

It's a web portal that's lives in a browser tab that I always keep open and pinned. The initial
requirements for this portal are defined below.

## Requirements

### App Layout

Viewport space is occupied by columns. By default, no columns are defined, in which case an option
is displayed to add the first column. Otherwise, each column occupies 25% of available viewport
width, and stack horizontally from left to right. If columns don't fill available width, empty space
is displayed, with an option to add another column. If more than 4 columns exist, only 4 are
displayed at once, with floating icon buttons appearing at the top left and right to slide columns
left and right, so columns animate into and out of view. Columns are internally vertically
scrollable when their contents exceed available vertical space, but their headings remain sticky.
Scrolling within one column doesn't affect other columns.

### Column Internal Layout

Each column has a top-level heading. Below that, widgets (described below) are laid out in a
vertical column, stacking vertically from top to bottom. Widgets cannot be laid out side-by-side
within a single column. If no widgets exist in a column, an option is displayed to add one. If
widgets don't occupy the full visible, vertical height of the column, an option is displayed to
append one. This can be accomplished simply by rendering the control at the end of the widget list,
and allowing it to be pushed out of view if the list exceeds the available vertical height. If the
widget list exceeds available vertical height, the column becomes automatically vertical scrollable.
Columns are never horizontally scrollable. Content in excess of available horizontal width is simply
not visible.

### Widgets

Columns are populated by _widgets_. Every widget has a customizable subheading describing its
contents. Clicking it expands/collapses the widget body. Widget types include:

- **Bookmarks** — An unordered list of bookmarks. The list can be nested at most two levels deep.
  Only leaf nodes can be hyperlinks. Branch nodes serve to expand/collapse the sublist.
- **Copyable Snippets** — Collections of copy/pastable text snippets, often consisting of shell
  commands or special unicode characters, hence rendered in preformatted, monospaced font. Each
  snippet has its own label. Snippets have two forms: whole-text copyable, or single-character
  copyable. Clicking anywhere in a whole-text copyable snippet copies the whole snippet of text.
  Clicking on a single-character copyable snippet copies just the character that was clicked.
- **Form Grids** — One or more form fields laid out in a grid. Each field is a separate, simple
  form. The only visible form control is the one field. The field is single-line; it doesn't support
  wrapping. Typing and pressing enter in the field activates the form. The field's value is inlined
  into a URL template, and the resulting URL is opened in a new tab.

Other widget types may be added in the future.

### Customizability

Columns can be created, edited, deleted, shown and hidden, and re-ordered. New columns can be
prepended, appended, or inserted anywhere in between. Column headings can be customized. Widgets
within a column can also be prepended, appended, or inserted anywhere in between.

The app has an _admin mode_ in which the controls for these operatios are visible. These operations
are _only_ available in admin mode, with the two exceptions already described above:

1. There aren't enough columns to fill available horizontal space.
2. There aren't enough widgets to fill available vertical space within a column.

Admin mode is toggled on and off by hitting ESC twice in rapid succession.

## Architecture

The project uses Deno running an always-on webserver. The webserver is only accessible on localhost
— other devices on the same network cannot see it. It serves a SPA written in TypeScript and React.
The OS the webserver runs on doesn't always matter, but where it does, assume MacOS. When the
machine boots, a launch script starts the webserver and monitors it in order to keep it up and
running, so that it's always available. The app is served over HTTPS, which apart from security,
ensures it can leverage modern HTTP 2+ features like multiplexing many network calls over a single
connection. I'm open to suggestions on how to set this up, but I suspect a cert authority will need
to be created and registered on this machine, and a certificate will need to be created and signed
by that CA, and used by the webserver so it can serve HTTPS. Any secret keys created during this
process would then need to be stored in a gitignored folder under this repo. Let me know if there's
an easier and/or more secure way to set this up. The UI uses the
[Chakra library](https://chakra-ui.com/).

### Paths

- `/web/app` — Serves the SPA.
- `/web/assets/*` — All associated `.js`, `.css`, (etc.) assets live here.
- `/api/*` — Any data-serving endpoints live under this namespace.

## Engineering Standards

See [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md).
