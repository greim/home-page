# Your Home Page — An App That Builds Itself

_Your Home Page_ is an app that can add features to itself and fix its own bugs, via a
Claude-powered assistant that launches from within the app. Ask it for a column of news links, a
stock ticker, a feed reader, or a map, and if it can't do that yet, it writes the code for you.
Think of it as just another way of using [Claude Code](https://code.claude.com/) — the assistant can
do anything Claude can do. If you're more of a power user type, you can use Claude directly to do
all the same things.

## How Does It Work?

The app isn't deployed to a remote server. Instead, it runs on localhost, directly out of a git repo
on your machine that you fork from [this GitHub repo](https://github.com/greim/home-page). The app
is open source. If you agree with the [LICENSE](./LICENSE), sharing your bug fixes and feature
improvements with the world is as simple as committing them and making a pull request. Don't know
how to do that? That's also something the assistant can help you with.

## How Does It Protect My Personal Data?

The assistant makes a sharp distinction between source code and personal data. Source code never
contains secrets or private data, and can thus be committed to the repo. Personal data is never
committed. It's stored in a [git-ignored](https://git-scm.com/docs/gitignore) folder, or in your
browser's local storage. It never leaves your machine, with two exceptions:

- What the assistant reads to do what you ask (a screenshot of the page with each message, and your
  layout when you ask it to change the page), which goes to Anthropic as in any Claude Code session.
- What a widget sends to an outside service (to look up addresses, say). Such a widget has to ask
  you first. It shows what it sends, to whom, and links to their privacy policy and terms of
  service, and stays off until you agree. Your answer is kept in this browser, and you can withdraw
  it in the column editor.

## Screenshots

| Day Mode                                                                                                                                                | Night Mode                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ![Four colored columns of widgets: a clock, a workday progress bar, search fields, bookmarks, copyable commands and characters](.github/readme-day.png) | ![The same page at night: gray columns under a field of stars](.github/readme-night.png) |

## Getting Started

To launch the app, you need a Mac and a current browser (Chrome, Firefox or Safari). Open the
[Terminal app](https://www.google.com/search?q=how+to+launch+the+terminal+app+in+macos) on your Mac
and follow these steps.

**1. Check for git.** Type this and press Return:

```sh
git --version
```

If it prints a version, such as `git version 2.50.1`, you have it. If macOS instead offers to
install the command line developer tools, click **Install** and wait for it to finish. (Typing
`xcode-select --install` opens that same offer.)

**2. Check for Deno.** Deno runs everything here, and it needs to be version 2 or later:

```sh
deno --version
```

- If it prints `deno 2.x`, you're set.
- If it prints `deno 1.x`, run `deno upgrade`.
- If it says `command not found`, go to the [Deno website](https://deno.com/) and follow
  instructions to install.

**3. Get the code.** This puts it in a `home-page` folder in your home folder:

```sh
cd ~
git clone https://github.com/greim/home-page.git
cd home-page
```

**4. Run setup:**

```sh
deno task setup
```

From here, setup takes over.

> **Note about Linux and Windows**: These platforms aren't supported yet, only because I don't run
> them, not because they're unwelcome. The macOS-specific parts are running the services (launchd)
> and trusting the certificate (the login keychain): the setup and service scripts in `bin/` and
> `tooling/`, plus the assistant service restarting the server (`src/server/assistant-live.ts`). If
> you'd like it on your OS, pull requests are welcome.

## Setup

`deno task setup` looks at how things stand on your computer, tells you, and asks before it changes
anything. In turn, it:

- Checks for macOS, Deno 2, git, and the `openssl` and `security` tools that come with macOS.
- Checks for [Claude Code](https://code.claude.com/), which the assistant runs on and signs in with.
  If you don't have it, setup says where to get it. You can carry on without it and add it later;
  the page works without the assistant.
- Makes the page's HTTPS certificate and has macOS trust it. macOS asks for your password for this.
  (If Firefox is open at the time, quit and reopen it afterwards. It only reads trusted certificates
  when it starts.)
- Installs the page's two background services, which start when you log in.
- Waits for them to start, then gives you the page's address: <https://localhost:8443/web/app>.

The page starts with a single column holding a clock. Pin it, or make it your browser's home page,
and press **F2** to start making it your own.

You can stop setup at any point, and run it again to pick up where you left off. Run it again any
time, too. With everything already working, it says so and offers to restart the services (say,
after pulling new code). If something's wrong, it says what and offers to fix it. It also offers to
renew the certificate when it's about to expire.

**It all belongs to one Mac account.** Setup installs everything for the account you run it in. The
services run as that account, out of its copy of the repo, with its Claude Code login, and only that
account's keychain trusts the certificate. The services run whenever that account is logged in, even
in the background while another account is in use. To run setup again or work on the repo, log in to
that account. Other accounts on the same Mac get a certificate warning if they open the page.

## High Level Feature Overview

- **Columns of widgets.** Each column has a heading, an icon and a color. The page fills the width
  of the window and scales with it.
- **Widgets that come with it:**
  - **Bookmarks**, with folders.
  - **Search fields** that open a site's search with what you typed.
  - **Copyable snippets**, such as shell commands or special characters.
  - **A clock**.
  - **A workday bar** showing how far you are through your working week.
- **The assistant.** Claude Code, over the page or in a floating window of its own. It can rearrange
  the page for you, write new kinds of widget, or work on any other part of the code, as it would in
  a terminal.
- **Night mode.** After your day ends, the page fades to gray and a starfield comes out.

## Using it

- Press **F2** to toggle **admin mode**. The columns look exactly the same, but what you can change
  becomes clickable:
  - Click a column's heading to rename it (Enter saves, Esc cancels).
  - Click its icon to pick another.
  - Click a widget or the column's background to open the **column editor**.
- The **column editor** edits a column's heading and icon, and lists its widgets. Drag them to
  reorder, send them to another column, delete them, add new ones, or select one to edit its
  settings. Changes apply when you click Save.
- The **column navigator** along the bottom is always shown in admin mode:
  - Add columns with the dashed boxes at either end, or the "+" markers between thumbnails.
  - Each thumbnail has icons to move (drag it, or use the arrow keys), delete, and hide its column,
    and to color it. Drag the hue and chroma sliders and the column changes as you go; OK closes
    them. Column colors share one lightness, so white text always reads on them.
- The **admin bar** along the top says how to leave admin mode. At night, its sun button shows the
  page in daytime, so you can see and edit column colors. Its gear opens the page's settings.
- **Bookmarks** are edited as an outline: `Label | URL` per line. A line without a URL is a folder,
  and the indented lines below it are its links.
- **Search field** URLs use `{query}` where what you type goes.
- **Your day and weekend** (when night mode starts and ends, and what the workday bar follows) are 9
  to 5 with Saturday and Sunday off until you change them in settings (the admin bar's gear). If you
  don't have a set weekend, say so there, and every day counts as a workday.
- **The assistant, the settings and the column editor open over the page**, with the page dimmed
  behind them. Click the dimmed part, press Esc, or ✕ to close one (unsaved changes are discarded).
  Widgets that need more room open the same way. In Chrome, Edge and Firefox, the button beside the
  ✕ moves it into a small window of its own, floating above your other windows, so you can keep it
  open while you use the page. That window's button brings it back over the page.

## The assistant

The **assistant** button in the admin bar opens Claude Code over the page. It's another way of using
Claude Code in this repo, as if you'd typed into it in a terminal:

- It uses your own Claude Code login, settings, permission rules, hooks, MCP servers and skills.
- It can change any code, run commands, and commit when you ask.
- Anything your settings don't already allow, it asks first. You can allow once, always allow, or
  deny, in the chat. Plan mode and accept-edits mode work as in the terminal.
- It sees a screenshot of the page with each message, so you can say "make that column blue".
- You can pick the model, use slash commands, paste images, and continue past conversations,
  including ones you started in a terminal.
- Its conversation carries on while the window is closed, and survives a reload.

When a turn changes code, the assistant puts it into effect. It restarts the server, or itself, if
their code changed, and offers to reload the page if the page's or a widget's code changed.

## Your data

Your layout is saved to `data/layout.json`. It's plain, pretty-printed JSON, safe to back up or
hand-edit while the server is stopped. Everything under `data/` is gitignored, so your layout never
ends up in a commit. Widgets that need an API key keep it in your browser's `localStorage`, out of
the repo and out of the assistant's view.

Both services listen on 127.0.0.1 only. The assistant has the same powers as Claude Code in a
terminal, so treat it the same way.

## Running it

### The services

Setup installs them as two launchd user agents with `KeepAlive`, so launchd restarts each whenever
it exits:

- `local.home-page`, the server (port 8443), logging to `logs/server.log`.
- `local.home-page.assistant`, the assistant service (port 9443), logging to `logs/assistant.log`.
  It's separate so restarting the server never stops the assistant mid-turn.

Both get the `PATH` of the terminal you ran setup in, since the assistant runs commands (`deno`,
`git`, ...) as a terminal would. If that changes, or you move the repo or Deno, `deno task setup`
notices and offers to reinstall them.

```sh
deno task restart-service             # restart both (e.g. after pulling changes), wait till ready
deno task restart-service app         # just the server
deno task restart-service assistant   # just the assistant service
launchctl print gui/$(id -u)/local.home-page   # status
```

The server bundles the page when it starts, which takes 30–40 seconds. `restart-service` waits until
each service takes connections again (up to 2 minutes) and says when to reload.

### How HTTPS works here

Setup creates a throwaway certificate authority that is _name-constrained_ to `localhost` and
`127.0.0.1`, signs a server certificate with it, then **deletes the CA's private key**. Only the
server's key remains (in the gitignored `.secrets/`), and the trusted CA can never be used to issue
another certificate — nor, thanks to the name constraints, could it vouch for any other site even if
the key had leaked. Certificates last 825 days. In the last 30, `deno task setup` offers to make a
new one and restart the services.

### Troubleshooting

Start by running `deno task setup` again. Beyond what it finds:

- **The page doesn't load.** Look in `logs/server.log`. If the service keeps restarting, the error
  is there.
- **The assistant doesn't answer.** Look in `logs/assistant.log`, and check `claude` works and is
  signed in from a terminal.
- **The browser warns the connection isn't private.** Firefox reads trusted certificates from the
  keychain only when it starts, so if it was open when setup made the certificate, quit and reopen
  it. Don't click through the warning: that only covers the page's port, and the assistant (on port
  9443) will still fail to connect. Otherwise, run `deno task setup` and approve the keychain
  prompt, then restart the browser.
- **Port 8443 or 9443 is taken.** `lsof -nP -iTCP:8443 -sTCP:LISTEN` shows by what. For development,
  run second servers beside the services on other ports (see [Development](#development)).

### Uninstalling

```sh
deno task uninstall-service
security delete-certificate -c "Home Page Localhost CA" ~/Library/Keychains/login.keychain-db
```

Then delete the repo folder, which holds your layout (`data/`) and the certificate (`.secrets/`).

## Development

```sh
deno task dev              # run the server, restarting on changes to src/ or tooling/
deno task start-assistant  # run the assistant service
deno task build            # type-check, format check, lint, test (90% coverage), build the widgets
deno task fmt              # auto-format
```

Stop the services first, or run beside them on other ports:
`PORT=8444 ASSISTANT_PORT=9444 deno task dev` (and the same for `start-assistant`).

The coding standards, and how the app is put together, are in
[the skills in `.claude/skills/`](./.claude/skills/), which Claude Code (the assistant included)
loads by itself. Start with `repo-layout`, and `micro-frontends` for how widgets work. VS Code with
the Deno extension picks up the repo's settings (`.vscode/settings.json`).

## License

[MIT](./LICENSE)
