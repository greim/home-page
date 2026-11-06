# Home Page

A personal home page served from localhost over HTTPS. See [VISION.md](./VISION.md) for requirements
and [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) for coding standards.

## First-time setup (macOS)

```sh
deno install               # fetch dependencies
deno task setup-certs      # create & trust a localhost TLS certificate (prompts for approval)
deno task install-service  # start at login, restart automatically if it ever exits
```

Then open and pin <https://localhost:8443/web/app>.

### How HTTPS works here

`setup-certs` creates a throwaway certificate authority that is _name-constrained_ to `localhost`
and `127.0.0.1`, signs a server certificate with it, then **deletes the CA's private key**. Only the
server's key remains (in the gitignored `.secrets/`), and the trusted CA can never be used to issue
another certificate — nor, thanks to the name constraints, could it vouch for any other site even if
the key had leaked. Certificates last 825 days; re-run `deno task setup-certs` and restart the
service to renew.

### The service

`install-service` registers a launchd user agent (`local.home-page`) with `KeepAlive`, so launchd
restarts the server whenever it exits. Logs go to `logs/server.log`. launchd's PATH won't find
`claude`, so it uses `CLAUDE_PATH` if set, otherwise asks for the path (Enter accepts what
`which claude` finds) and puts it in the service's environment.

```sh
launchctl print gui/$(id -u)/local.home-page      # status
launchctl kickstart -k gui/$(id -u)/local.home-page # restart (e.g. after pulling changes)
deno task uninstall-service
```

The server bundles the client in memory at startup, so restarting picks up code changes.

## Data

Your layout is saved to `data/layout.json` (gitignored). It's plain, pretty-printed JSON, safe to
back up or hand-edit while the server is stopped. Background images you upload or fetch are saved in
`data/backgrounds/`, named by a hash of their contents.

## Using it

- Press **F2** to toggle admin mode, where columns and widgets can be added, edited, moved, hidden,
  and deleted.
- Bookmarks are edited as an outline: `Label | URL` per line; a line without a URL is a folder, and
  indented lines below it are its links.
- Form grid URL templates use `{query}` as the placeholder.
- In admin mode, an admin bar along the top holds the admin-wide controls.
- The admin bar's **Background** button sets the image tiled behind the columns, the color beneath
  it, and the image's opacity. Images can be built-in (anything in `src/client/static/`), uploaded
  from disk, or fetched from a web URL, which the server downloads and saves locally. PNG, JPEG,
  GIF, WebP and AVIF are supported, up to 10 MB.
- The admin bar's **Assistant** button opens a chat with Claude, which can make any admin-mode
  change for you ("add a column of news bookmarks", "make the background darker"). See below. To
  keep it on view, add an **Assistant** widget to a column: it's the same conversation, usable
  outside admin mode. The conversation survives a reload until you start a new one.
- Admin mode doesn't add anything to the columns, so they look exactly the same. Instead, things you
  can change become clickable: click a column's heading to rename it (Enter saves, Esc cancels), its
  icon to pick another, or a widget or the column's background to open the **column editor**.
- The column editor edits a column's heading, icon and background color, and lists its widgets: drag
  them to reorder, send them to another column, delete them, add new ones, or select one to edit it.
  Changes apply when you click Save. A column's text switches to light or dark automatically to suit
  its background color.
- In admin mode the column navigator along the bottom is always shown. Add columns with the dashed
  boxes at either end or the "+" markers between thumbnails; each thumbnail has icons to move (drag
  it, or use the arrow keys), delete, and hide the column.

## The admin assistant

The assistant is [Claude Code](https://code.claude.com/) run headlessly by the server, one process
per message (`--resume` continues the conversation). It needs `claude` installed and signed in
(`CLAUDE_PATH` if set, otherwise `claude` on PATH). The cost and time of each turn are shown under
it.

Besides editing the layout, it can write new widget types, or change existing ones, in
`src/client/widgets/`. Its prompt lists every widget type and its config schema, from the widget
registry. See [SELF_BUILDING.md](./SELF_BUILDING.md).

It's confined (`--restricted`, `--permission-mode dontAsk`, no MCP servers): no shell, it can read
the repo (except `.secrets/`) and the web, and the only files it can change are its copy of the
layout, `data/assistant/layout.json`, and those in `src/client/widgets/`. When its turn ends, the
server checks its work: if widget code changed, it formats, type checks, lints and tests
`src/client/widgets/` and rebuilds the widgets; then it checks the layout, including each widget's
config against its type's schema. If everything passes, the layout is applied to the live page
(reload to pick up new widget code). If something fails, or you changed the page by hand meanwhile,
the agent is told why and tries again (up to 3 times in all). Only one turn runs at a time. Widget
code it writes is yours to review and commit.

## Look and feel

The gap around and between columns, the corner shape, and the column drop shadow are set in
`src/client/surface.ts`, along with the preset column colors. Files in `src/client/static/` are
served as-is under `/web/assets/`, and image files there appear as built-in backgrounds.

## Development

```sh
deno task dev     # run with auto-restart on changes to src/ or tooling/ (stop the service first,
                  # or run beside it on another port: PORT=8444 deno task dev)
deno task build   # type-check, format check, lint, test with 90% coverage threshold
deno task fmt     # auto-format
```
