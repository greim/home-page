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
restarts the server whenever it exits. Logs go to `logs/server.log`.

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

- Press **Esc twice** quickly to toggle admin mode, where columns and widgets can be added, edited,
  moved, hidden, and deleted.
- Bookmarks are edited as an outline: `Label | URL` per line; a line without a URL is a folder, and
  indented lines below it are its links.
- Form grid URL templates use `{query}` as the placeholder.
- In admin mode, the **Background** button (bottom left) sets the image tiled behind the columns,
  the color beneath it, and the image's opacity. Images can be built-in (anything in
  `src/client/static/`), uploaded from disk, or fetched from a web URL, which the server downloads
  and saves locally. PNG, JPEG, GIF, WebP and AVIF are supported, up to 10 MB.
- In admin mode, the swatch in each column's header sets its background color. Text switches to
  light or dark automatically to stay readable.

## Look and feel

The gap around and between columns, the corner shape, and the column drop shadow are set in
`src/client/surface.ts`, along with the preset column colors. Files in `src/client/static/` are
served as-is under `/web/assets/`, and image files there appear as built-in backgrounds.

## Development

```sh
deno task dev     # run with auto-restart on changes to src/ or tooling/ (stop the service first)
deno task build   # type-check, format check, lint, test with 90% coverage threshold
deno task fmt     # auto-format
```
