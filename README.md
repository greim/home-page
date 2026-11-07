# Your Home Page

A personal home page served from localhost over HTTPS. See [VISION.md](./VISION.md) for requirements
and [the skills in `.claude/skills/`](./.claude/skills/) for coding standards (Claude Code, the
assistant included, loads them by itself).

## Requirements

| What                                                   | Why                                                                                                                                         | Get it                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **macOS**                                              | The server runs as a launchd service, and its HTTPS certificate is trusted through the login keychain. There's no Linux or Windows support. | —                                                                 |
| **[Deno](https://deno.com/) 2**                        | Runs everything. The server bundles the page at startup with Deno's built-in bundler, so older versions won't do. Known to work with 2.9.   | `brew install deno`, or `deno upgrade`                            |
| **[Claude Code](https://code.claude.com/)**, signed in | The assistant runs Claude Code (bundled with the Agent SDK) and signs in with your Claude Code login.                                       | Install it, then run `claude` once to sign in                     |
| **git**                                                | Getting the code. Nothing in the app runs it.                                                                                               | Comes with the Xcode command line tools: `xcode-select --install` |
| **openssl** and **security**                           | Making and trusting the certificate.                                                                                                        | Built into macOS                                                  |
| **A current browser**                                  | The page uses recent CSS (e.g. OKLCH colors). Current Chrome and Safari work.                                                               | —                                                                 |
| **Ports 8443 and 9443** free                           | The server and the assistant service listen on them, on 127.0.0.1 only.                                                                     | —                                                                 |

An editor isn't needed to run it. To work on the code, VS Code with the Deno extension picks up the
repo's settings (`.vscode/settings.json`).

## Setup

```sh
git clone https://github.com/greim/home-page.git
cd home-page
deno task doctor           # what's missing, and how to fix it (fetches dependencies first)
deno task setup-certs      # create & trust a localhost TLS certificate (prompts for approval)
deno task install-service  # start at login, restart automatically if it ever exits
deno task doctor           # everything should now pass
```

Then open and pin <https://localhost:8443/web/app>. It starts with a single column holding a clock;
press **F2** to start making it your own (see [Using it](#using-it)).

`deno task doctor` checks each requirement above, then the certificate (and its expiry), whether
macOS trusts it, and whether both services are running. It prints a fix for anything wrong, and
exits non-zero if anything keeps the page from working. Run it whenever something seems off.

### How HTTPS works here

`setup-certs` creates a throwaway certificate authority that is _name-constrained_ to `localhost`
and `127.0.0.1`, signs a server certificate with it, then **deletes the CA's private key**. Only the
server's key remains (in the gitignored `.secrets/`), and the trusted CA can never be used to issue
another certificate — nor, thanks to the name constraints, could it vouch for any other site even if
the key had leaked. Certificates last 825 days; re-run `deno task setup-certs` and restart the
service to renew.

### The services

`install-service` registers two launchd user agents with `KeepAlive`, so launchd restarts each
whenever it exits:

- `local.home-page`, the server (port 8443), logging to `logs/server.log`.
- `local.home-page.assistant`, the assistant service (port 9443), logging to `logs/assistant.log`.
  It's separate so restarting the server never stops the assistant mid-turn.

Both get the installing shell's `PATH`, since the assistant runs commands (`deno`, `git`, ...) as a
terminal would; re-run `install-service` if that changes.

```sh
deno task restart-service             # restart both (e.g. after pulling changes), wait till ready
deno task restart-service app         # just the server
deno task restart-service assistant   # just the assistant service
launchctl print gui/$(id -u)/local.home-page   # status
deno task uninstall-service
```

The server bundles the client in memory at startup, so restarting picks up code changes. That takes
30–40 seconds; `restart-service` waits until each service takes connections again (up to 2 minutes)
and says when to reload.

### Troubleshooting

Start with `deno task doctor`. Beyond what it reports:

- **The page doesn't load.** Look in `logs/server.log`. If the service keeps restarting, the error
  is there.
- **The assistant doesn't answer.** Look in `logs/assistant.log`, and check `claude` works and is
  signed in from a terminal.
- **The browser warns the connection isn't private.** Re-run `deno task setup-certs` and approve the
  keychain prompt, then restart the service and the browser.
- **Port 8443 or 9443 is taken.** `lsof -nP -iTCP:8443 -sTCP:LISTEN` shows by what. For development,
  run second servers beside the services on other ports (see [Development](#development)).

### Uninstalling

```sh
deno task uninstall-service
security delete-certificate -c "Home Page Localhost CA" ~/Library/Keychains/login.keychain-db
```

Then delete the repo folder, which holds your layout (`data/`) and the certificate (`.secrets/`).

## Data

Your layout is saved to `data/layout.json` (gitignored). It's plain, pretty-printed JSON, safe to
back up or hand-edit while the server is stopped. Its `schedule` sets when your day starts and ends
(`{ "startOfDay": "09:00", "endOfDay": "17:00" }` by default), in local time. There's no control for
it on the page yet: edit it there, or ask the assistant ("my day starts at 8").

## Using it

- Press **F2** to toggle admin mode, where columns and widgets can be added, edited, moved, hidden,
  and deleted.
- Bookmarks are edited as an outline: `Label | URL` per line; a line without a URL is a folder, and
  indented lines below it are its links.
- Form grid URL templates use `{query}` as the placeholder.
- In admin mode, an admin bar along the top says how to leave it. At night, its sun button shows the
  page in daytime, so you can see and edit column colors; night returns when you leave admin mode.
- The **assistant** button in the admin bar opens Claude Code in a window of its own, floating above
  your other windows (in Chrome or Edge; elsewhere, a panel at the side of the page). It can make
  any admin-mode change for you ("add a column of news bookmarks", "my day starts at 8"), and
  anything else Claude Code can do in the repo. See below. Its conversation carries on while the
  window is closed, and survives a reload. (It used to be a widget in a column; layouts that still
  have one drop it when they're next read.)
- Admin mode doesn't add anything to the columns, so they look exactly the same. Instead, things you
  can change become clickable: click a column's heading to rename it (Enter saves, Esc cancels), its
  icon to pick another, or a widget or the column's background to open the **column editor**.
- The column editor edits a column's heading, icon and background color, and lists its widgets: drag
  them to reorder, send them to another column, delete them, add new ones, or select one to edit it.
  Changes apply when you click Save. Column colors are
  [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch) at
  one shared lightness: you pick a preset, or a hue and chroma, and text on them is always white.
- In admin mode the column navigator along the bottom is always shown. Add columns with the dashed
  boxes at either end or the "+" markers between thumbnails; each thumbnail has icons to move (drag
  it, or use the arrow keys), delete, and hide the column.

## The assistant

The assistant is another way of using [Claude Code](https://code.claude.com/) in this repo, as if
you'd typed into it in a terminal. The assistant service (`src/server/assistant-main.ts`) runs it
through the Agent SDK in the repo, with your own Claude Code settings, permission rules, hooks, MCP
servers and skills (`.claude/skills/`), and signs in with your Claude Code login. It can change any
code, run commands, and commit when you ask.

The window shows the agent's work as it happens: its text as it writes it, each tool call
(expandable, with a diff for edits), and a Stop button. Its header picks the model, switches the
permission mode (ask before acting, accept edits, or plan first: choose it before the first message
to start a conversation that way), and starts a new conversation or continues a past one, including
ones you started in the terminal. Under it, the conversation's model, how full its context is, and
its cost so far. Type `/` for slash commands and skills; paste or drop images (PNG, JPEG, GIF or
WebP, up to 5 MB) to send them with a message. In plan mode, the plan comes as a card to approve
(accepting the edits that carry it out, or asking before each) or send back for more planning. When
a command it left running in the background finishes, it may carry on by itself; that shows in the
window as a turn of its own.

Sessions start in Claude Code's default permission mode: anything your settings don't allow is shown
in the chat to allow once, always allow (saving the rule to `.claude/settings.local.json`, as in the
terminal), or deny. Questions it asks you appear there too. The cost and time of each turn are shown
under it, and one turn runs at a time. Along with the page, it sees a screenshot of it with each
message.

For the page itself, it edits a copy of your layout, `data/assistant/layout.json` (which it may edit
without asking). When its turn ends, the service checks that copy, including each widget's config
against its type's schema. If it passes, it's applied to the live page. If it fails, or you changed
the page by hand meanwhile, the agent is told why and tries again (up to 3 times in all). Its prompt
lists every widget type and its config schema, from the widget registry. After changing widget code
it runs `deno task build`; reload the page to pick up the new widgets.

The service keeps a log of each turn's events, so a reload, or the page's server restarting, doesn't
lose a turn: the window picks up where it was.

When a turn changes code, the service puts it into effect once the turn ends: it restarts the server
if the server's or the page's code changed (and says in the chat when it's back), offers to reload
the page if the page's or a widget's code changed, and restarts itself if its own code changed
(conversations carry on). Reloading closes the assistant's window; the page then offers to reopen
it. Run by hand rather than as services, the chat says what to restart instead.

## Look and feel

The page's look is fixed (see [NEW_LAYOUT.md](./NEW_LAYOUT.md)): everything is monospace, and only
column colors are yours to choose. Between the end of your day and the start of the next (the
layout's `schedule`), the page fades to night over 20 seconds: columns turn gray and a starfield
comes out over them. Spacing, corners, shadows and the preset column colors are set in
`src/client/surface.ts`.

## Development

```sh
deno task dev     # run with auto-restart on changes to src/ or tooling/ (stop the service first,
                  # or run beside it on another port: PORT=8444 ASSISTANT_PORT=9444 deno task dev)
deno task start-assistant  # run the assistant service (likewise: PORT=8444 ASSISTANT_PORT=9444 ...)
deno task build   # type-check, format check, lint, test with 90% coverage threshold
deno task fmt     # auto-format
```
