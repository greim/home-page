# The Assistant Window

## Goal

The assistant is another front end to Claude Code, with everything the developer has when typing
into Claude Code in a terminal: Bash, editing anywhere in the repo, committing, their settings,
hooks, MCP servers, skills and CLAUDE.md. It can fix a server bug, run the tests, or commit when
asked.

Today it can't. It runs `claude -p` with `--restricted`, file and web tools only, writes limited to
the layout copy and `src/client/widgets/**`, and `dontAsk` permissions that silently refuse
everything else. Its UI is a widget in a column.

This plan replaces it with:

1. **An assistant service**, a separate process on its own port, which owns the agent and survives
   restarts of the main server.
2. **The Agent SDK** in place of `claude -p` flags, so the agent runs like interactive Claude Code
   and its permission prompts reach the UI.
3. **An assistant window**: a dedicated, larger UI rendered by the home page's React app into a
   Document Picture-in-Picture window, so there's no state to sync between windows.

## Architecture

```
Browser tab (home page, React)                       Document PiP window
┌──────────────────────────────┐   createPortal    ┌───────────────────────┐
│ columns, admin bar, ...      │ ────────────────► │ assistant UI          │
│ assistant state lives here   │                   │ (same React tree)     │
└──────┬───────────────────────┘                   └───────────┬───────────┘
       │ https://localhost:<app port>                          │ https://localhost:<assistant port>
       ▼                                                       ▼
┌──────────────────────┐   restarts when server code    ┌──────────────────────────┐
│ main server (Deno)   │ ◄──── changed, after a turn ── │ assistant service (Deno) │
│ page, layout, widgets│                                │ Agent SDK → Claude Code  │
└──────────────────────┘        both read/write         │ (cwd = repo root)        │
                        data/layout.json (atomically)   └──────────────────────────┘
```

Each server is its own launchd job, installed by `bin/install-service.ts`.

## The assistant service

### Why a separate process

The agent may change the main server's code, and the change only takes effect after a restart. Today
the agent is a child of the server, and its turn is tied to the HTTP request, so a restart would
kill it mid-turn. In its own process, on its own port, the agent outlives the server it's editing.

### Agent runtime: the Agent SDK

Switch from building `claude -p` arguments to `query()` from `@anthropic-ai/claude-agent-sdk`. It
spawns the same Claude Code binary, but gives the app hooks the CLI flags don't:

| Need                     | SDK feature                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Same setup as terminal   | `settingSources: ["user", "project", "local"]`, `cwd` = repo root                                |
| Claude Code's own prompt | `systemPrompt: { type: "preset", preset: "claude_code", append: <app context> }`                 |
| Approvals in the UI      | `canUseTool(toolName, input, { suggestions, signal })` → `allow` (with `updatedInput`) or `deny` |
| "Always allow"           | Return `updatedPermissions` from the offered `suggestions` (saved to settings, as in the CLI)    |
| Questions                | `AskUserQuestion` arrives through `canUseTool`; answer with `updatedInput.answers`               |
| Stop, change mode        | Streaming input mode: `interrupt()`, `setPermissionMode()`, `setModel()`                         |
| Continue a conversation  | `resume: sessionId`                                                                              |
| Live text                | `includePartialMessages: true` (`stream_event` messages)                                         |

Consequences:

- `agentAuth` (copying sign-in settings past `--restricted`) goes away: user settings load, and
  sign-in is the same as the CLI's, so a subscription login works.
- The skills in `.claude/skills/` load on their own, so the prompt no longer points at docs. The
  app's appended prompt shrinks to the app context: the layout working copy, the screenshot, and how
  applying a layout works.
- One long-lived `query()` per active session, in streaming input mode: that's what makes
  `interrupt()` and `setPermissionMode()` available. After the service restarts, the next message
  starts a new `query()` with `resume`.

#### Spike results (SDK 0.3.319, bundling Claude Code 2.1.319; Deno 2.9.8)

Verified with throwaway scripts in `scratch-docs/sdk-spike/`:

- **Runs under Deno** with `npm:@anthropic-ai/claude-agent-sdk`, using the bundled binary (the
  `darwin-arm64` optional dependency installs). Deno needs only
  `--allow-read --allow-env --allow-run --allow-sys`; the Claude Code child does its own file and
  network I/O.
- **Signs in with the subscription**: `apiKeySource` is `none`, and rate-limit events show the
  five-hour window. Nothing to configure.
- **Loads what the terminal loads**: the project skills, user MCP servers, plugins, slash commands,
  and the full tool set (Bash, Task, Edit, Write, WebSearch, ...).
- **Approvals**: `canUseTool` receives the tool name, input, and `title`, `description`,
  `blockedPath`, `decisionReason`, `toolUseID` and `suggestions`. Suggestions for a Bash command
  are: an allow rule saved to `localSettings`, adding a directory for the session, or switching the
  session to `acceptEdits`. Returning a suggestion as `updatedPermissions` with
  `destination: "session"` stopped the same command from prompting again. A deny `message` reaches
  the agent as the tool's error, and it doesn't retry.
- **Read-only commands never reach `canUseTool`** (`echo`, `sleep` ran unprompted), the same as in
  the terminal.
- **`AskUserQuestion` exists only when `canUseTool` is given.** It arrives through it with
  `requiresUserInteraction: true`; answering with `updatedInput.answers` works.
- **Plan mode**: `setPermissionMode("plan")` takes effect on the next message. The agent writes a
  plan file under `~/.claude/plans/` and calls `ExitPlanMode` (via ToolSearch), which reaches
  `canUseTool` with `{ plan, planFilePath }` and no suggestions. Allowing it switches the mode back
  to `default` (a `system/status` message reports `permissionMode`), and the agent carries on.
  Denying keeps it in plan mode.
- **Resume**: a new process with `resume: sessionId` keeps the session id and the conversation.
  Once, a resumed session came back in `plan` (the mode it had been switched to mid-session), but
  that didn't happen again in later runs, including a session that ended mid-plan. Passing
  `permissionMode: "default"` gave `default` every time, so the service passes it whenever it starts
  or resumes a `query()`. The UI shows the mode reported by `system/init` and `system/status`.
- **Interrupt**: `interrupt()` during a running Bash command stops it (`task_notification`
  `status: "stopped"`), and the turn ends with `result` subtype `error_during_execution`. The
  session carries on with the next message and knows it was interrupted.
- **Message stream**: `system/init` is repeated at the start of every turn in streaming mode, and
  there are many other `system` subtypes (`status`, `task_started`, `task_notification`,
  `thinking_tokens`) and `rate_limit_event`s. The wire format should pass on the ones the UI shows
  and drop the rest.

### Turns outlive requests

A turn belongs to the service, not to an HTTP request. The service keeps an event log for each
session; the UI subscribes to it (server-sent events, resuming from the last event id it saw). So a
page reload, a closed assistant window or a dropped connection never stops a turn, and the UI picks
up where it left off. Approvals and answers are separate requests back to the service, which
resolves the pending `canUseTool` promise.

Sketch of the API (all JSON, under `/api/assistant/`):

- `GET sessions`: past and running sessions, for a session list.
- `POST sessions/{id}/messages`: send a message (plus optional screenshot); starts a turn. One turn
  runs at a time across the app, so this is refused (409) while any turn is running, and the UI
  disables sending. (A tabbed UI with a turn per session can come later.)
- `GET sessions/{id}/events?after={n}`: the event stream.
- `POST sessions/{id}/permissions/{requestId}`: allow (once or always), or deny with a message.
- `POST sessions/{id}/interrupt`, `POST sessions/{id}/mode`, `POST sessions/{id}/model`.

The wire format stays an Effect Schema union in `src/common/`, extended with permission requests,
questions, tool calls and results, partial text, and mode changes.

### Security: origin checks matter more now

This service runs an agent with Bash. Any web page the user visits could try to reach it, so:

- Bind to localhost only, on port 9443 (the main server is on 8443; both can be overridden from the
  environment), over HTTPS with the existing certificate.
- Keep the main server's `Host` check (against DNS rebinding).
- The page and the service are different origins (different ports), so the service must allow CORS
  for the app's origin **only**, and refuse any request whose `Origin` isn't the app's. Requests
  with no `Origin` (non-browser clients on the same machine) are no new risk: anything local can
  already run `claude`.

### Restarts

At the end of every turn (the user's or the agent's own, never mid-turn, so a half-finished
multi-file edit never boots), the service compares the repo's files with how they were when the turn
began, and acts on what changed. Which process a file belongs to is decided by each entry point's
module graph (`deno info --json` on `src/server/main.ts` and `src/server/assistant-main.ts`), so a
shared module like `src/common/assistant.ts` counts for both.

| What changed in the turn                                                  | What happens                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A module the main server loads (`src/server/`, `src/common/`, `tooling/`) | The main server restarts                                                                                                     |
| The page's own code (`src/client/`, not its widgets)                      | The main server restarts (it bundles the page at startup), then the page offers to reload                                    |
| Only widget code (`src/client/widgets/`)                                  | No restart: widgets are served from `dist/` on disk, which the agent's `deno task build` rebuilds. The page offers to reload |
| A module the assistant service loads                                      | The assistant service restarts itself, after the turn ends                                                                   |
| Anything else (docs, `data/`, `.claude/`)                                 | Nothing                                                                                                                      |

- **Main server restarts** use `launchctl kickstart -k`. The service waits for it to answer again
  (it takes 30–40 s to bundle) and reports in the chat; if it doesn't come back, it says so, and the
  agent can read `logs/server.log` to fix it (launchd keeps retrying).
- **Reloading** closes the assistant window (see below), so the page offers to reload rather than
  reloading on its own. Widget-only changes could later skip the reload by re-importing the widget's
  bundle.
- **The assistant service restarting itself** loses only its in-memory event log. Conversations
  survive, since Claude Code keeps their transcripts and `resume` continues them.
- **By hand:** a new `deno task restart-service` restarts both launchd jobs, or one of them when
  named (`app` or `assistant`). `install-service` and `uninstall-service` handle both jobs.

### Layout editing

Keep today's loop: the agent edits a working copy of the layout, the app validates it (schema and
each widget's config), and applies it or explains the rejection with an "[app]" message. It moves
into the assistant service, which writes `data/layout.json` with the existing atomic store code, so
it doesn't depend on the main server being up. The page learns of the change through the event
stream, as now.

With full parity the agent _could_ edit `data/layout.json` directly and skip validation. The
appended prompt should say to use the working copy.

### Checks after a turn

None. Today the app formats, type checks, lints and tests the widget folder after each turn.
Instead, as in the terminal, the agent runs `deno task build` itself, guided by the skills and your
settings. The widget checks (`widget-checks.ts` and the `checkWidgets` / `fingerprintWidgets` pipes)
are removed. Checking a layout's widget configs against their manifests stays: that's part of
validating the layout, not checking code.

## The assistant window

### Document Picture-in-Picture

The admin bar gets an "Assistant" button. Its click handler calls
`documentPictureInPicture.requestWindow({ width, height })`, and the app renders the assistant UI
into the new window with `createPortal`. It's one React tree, so the assistant's state lives in the
page and nothing is synced between windows.

What the API gives and imposes (Chrome 116+ / Edge 116+; Safari doesn't support it):

- **Floats on top** of other windows, and the user can resize it. The app suggests a size; it can't
  place it.
- **Opening needs a user gesture.** It can't reopen itself.
- **It closes when the page reloads, navigates or closes**, and it can't be navigated itself. Its
  `pagehide` event fires on every close.
- One per tab.

### Rendering React and Chakra into it

The new window's document starts empty. To render Chakra there:

- **Styles.** Chakra v3 injects its CSS with Emotion into the page's `<head>`. Give the portal an
  Emotion cache whose `container` is the PiP window's `<head>`, so its styles land there. Copy the
  page's other style sheets across once on open.
- **Overlays.** Menus, popovers, tooltips and dialogs portal to `document.body` by default, which
  would put them in the page. Wrap the UI in Chakra's `EnvironmentProvider` pointed at the PiP
  document so they open in the assistant window.
- **Events.** React listens on portal containers too, so clicks and keys in the window work.
- **Viewport-relative design.** The window has its own viewport, so with its root font size at `1vw`
  the assistant UI scales with the _assistant window's_ width, not the page's. Set the root font
  size on the PiP document explicitly.

The wrapping, verified in the spike:

```tsx
const cache = useMemo(() => createCache({ key: "pip", container: win.document.head }), [win]);
return createPortal(
  <CacheProvider value={cache}>
    <EnvironmentProvider value={() => win.document}>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </EnvironmentProvider>
  </CacheProvider>,
  win.document.body,
);
```

#### Spike results (Chrome, Chakra 3.37.0, React 19.2)

Verified with a throwaway page driven by puppeteer in `scratch-docs/pip-spike/`:

- **Opens at the requested size** (480 × 640 asked; 480 × 584 inner). It opens from a real click,
  and `pagehide` fires when it closes.
- **One React tree works**: clicks and typing in the window update state that the page renders, and
  vice versa.
- **Chakra styles** land in the window's `<head>` (none leak into the page's), and components look
  right. With the root font size at `1vw`, the window's `rem` follows its own width.
- **Menus and popovers** open inside the window, selecting a menu item works, and Escape closes a
  popover.
- **Dialogs: inconclusive, not a PiP problem.** In the spike page, a Chakra `Dialog` didn't take
  focus or close on Escape, but it did exactly the same **in the main page**, so the spike's setup
  is at fault, not PiP. Check dialogs again with real app code in phase 3.
- **Clipboard** writes work from the window (through either window's `navigator`), and so does a
  **file picker** opened from an `<input type="file">` in it.
- **No throttling**: with the page's tab hidden behind another tab and the window in front, the
  page's timers kept full speed (50 of 50 ticks of a 100 ms interval in 5 s), and clicks in the
  window still updated the page's state.
- **A reload closes the window**, as the spec says. `documentPictureInPicture.window` is `null`
  afterwards.
- Not tested: paste of images into the window, and drag-and-drop.

### Reloads

The page reloads after client code changes, and a reload closes the window. Because turns live in
the service, nothing is lost: the page remembers that the window was open, and after the reload
shows a "Reopen assistant" button. One click (the gesture the API requires) reopens it, and the
event stream catches it up.

### Where PiP isn't available

In browsers without Document PiP, open the same UI as a panel in the page. The page is the same
React tree either way; only the container differs.

### What the UI does

Parity first, then the rest.

**Parity:**

- Transcript with Markdown, and live text as it streams.
- Tool calls shown as they happen, collapsible, with inputs and results; diffs for edits.
- Permission requests as cards: allow once, always allow (from the SDK's suggestions), or deny with
  a note.
- `AskUserQuestion` as a small form.
- Stop button (`interrupt()`), and a permission-mode switch (default, accept edits, plan).
- Sessions: new, resume a past one. Permission mode starts at `default` (ask for anything your
  settings don't allow), the same as the terminal, for resumed sessions too.

**Then:**

- Model picker, cost and context usage.
- Attach the page screenshot (as now) or paste images.
- Slash commands and skills (the SDK lists them).
- Plan review for plan mode.

The assistant column widget (`src/client/widgets/assistant/`) is removed. Layouts that still contain
one need a migration at the decoding boundary that drops it.

## Phases

1. **Spikes**, each a throwaway in `scratch-docs/`:
   - ~~Agent SDK under Deno~~: done, see "Spike results" above.
   - ~~PiP with React and Chakra v3~~: done, see its "Spike results" above.
2. ~~**Assistant service**~~: done. New process on port 9443 on the SDK, turn ownership and the
   event log, origin checks, layout apply moved over, second launchd job, `restart-service`, and
   `deno task doctor` checks it. The existing widget UI talks to it. Beyond the sketch above:
   - **Log ids.** Each run of the service keeps a new log (`SendAccepted` is `{ log, after }`, and
     `GET events?log=&after=`). Following an earlier run's log gets a 410, which the widget shows as
     the reply being cut off, instead of waiting on numbers that will never come.
   - **Endpoints as built:** `POST messages` (202, or 409 while a turn runs),
     `GET events?log=&after=` (NDJSON), `POST answers/{requestId}` (204, or 404 if nothing waits),
     `GET health`. Sessions, interrupt, mode and model endpoints are left for phase 3.
   - **The widget got minimal approval and question cards**, and resumes a running turn after a
     reload by following the log from where it was.
   - **Its own layout copy is pre-allowed** (`allowedTools: Edit(./data/assistant/layout.json)`),
     since the service validates it before applying it.
   - **The launchd jobs get the installing shell's `PATH`**, so the agent's commands find `deno`,
     `git` and so on. `install-service` no longer asks for `claude`'s path: the SDK bundles Claude
     Code and signs in with the CLI's login.
   - **The SDK reads the environment and home directory when it's imported**, so `deno task test`
     now runs with `--allow-env --allow-sys`.
   - Verified end to end on a copy of the repo (ports 8444/9444): a turn, an approval (Bash
     `touch`), a layout change applied, session reuse across turns, and the widget in Chrome (send,
     Allow, reply) with no console errors.
3. ~~**Assistant window**~~: done. An "Assistant" button in the admin bar opens it as a Document PiP
   window (480 × 720 asked; a 16px rem, so it reflows rather than scales), or a panel docked to the
   side of the page where there's no Document PiP. It has the parity features: Markdown, streamed
   text, collapsible tool calls (diffs for edits, commands, results), approval and question cards,
   Stop, a permission-mode switch (ask / accept edits / plan), new conversation, and past
   conversations (the repo's sessions, the terminal's included, replayed from their transcripts).
   Beyond the sketch above:
   - **The agent can act between messages.** Claude Code runs long commands in the background on its
     own, and when one finishes it carries on by itself. The service now reads each session
     continuously; what the agent does with no message pending is a turn of its own (a `started`
     event, then the usual events and `done`). Output that arrives while a user's turn is still
     applying its layout waits until that turn ends or sends a retry. Before this, such output was
     taken as the reply to the next message (found in end-to-end testing).
   - **Clients follow the log continuously**, not per turn, so the agent's own turns show up live.
     Logged events carry their conversation's session id, and each client keeps its own
     conversation's (`GET state` gives the log and its latest event, to start following).
   - **Streamed text is transient**: sent to readers but not kept, numbered with the last kept
     event, and replaced by the finished text.
   - The app's notes before a user's message now start `[app note]` (its own messages still start
     `[app]`), so a past conversation's transcript shows just what the user typed.
   - Endpoints added: `GET state`, `POST interrupt`, `POST mode`, `GET sessions`,
     `GET sessions/{id}`. Model choice is left for phase 5.
   - Verified in Chrome on a copy of the repo: the window, an approval, Markdown, an expanded tool
     call, Stop (the command was killed), the mode switch, the sessions menu inside the window, and
     an agent turn appearing by itself after a background task finished. Chakra dialogs weren't
     needed: the window uses a menu and a native select.
4. ~~**Restarts**~~: done, as in "Restarts" above. Notes:
   - Module graphs come from `deno info --json`, which reports real paths (e.g. `/private/var`) and
     reports a missing module in its output rather than its exit code; both are handled.
   - A service counts as supervised when launchd runs it: launchd sets `XPC_SERVICE_NAME` to the
     job's label. Run by hand (`deno task dev`, `start-assistant`), the chat says what to restart.
   - The agent's prompt says the app puts changes into effect, so it doesn't restart anything
     itself.
   - After a reload closes the window, the page shows "Reopen the assistant" (a note in
     `sessionStorage`, set as the page unloads with the window open). A panel (no Document PiP)
     simply reopens.
   - Verified in Chrome on an unsupervised copy: a widget edit offers a reload; reloading closes the
     window and offers to reopen it; reopening shows the conversation; a server edit says to run
     `deno task restart-service app`. The supervised path (launchd kickstart, then waiting for the
     server to answer) is covered by tests with fake pipes, and is a manual check on the installed
     services (see `assistant-live.test.ts`).
5. ~~**The rest**~~: done.
   - **Removed the assistant widget** (`src/client/widgets/assistant/`), its layout-applied channel
     and its surface tokens. Layouts that still have one drop it when read (`retiredWidgetTypes` in
     `src/common/model.ts`).
   - **Costs were wrong, and are fixed.** The SDK's `total_cost_usd` is a session's running total,
     not each result's own, so each turn showed the session's total so far (and a turn with retries
     added totals up). Each result's own cost is now its share of the running total. A resumed
     session's first total includes its earlier turns, so that turn shows no cost.
   - **Usage:** after each result, a `usage` event gives the conversation's total cost, how full its
     context is (`getContextUsage`) and the model; the window shows it under its header.
   - **Models and commands** come from `GET capabilities`, read from a throwaway query that's never
     sent a message (it answers `supportedCommands()` and `supportedModels()` in about half a
     second, at no cost). `POST model` applies the chosen model to the open session (`setModel`) and
     to new ones.
   - **Slash commands and skills** are offered as you type `/` (Tab takes the first), and sent as
     the message.
   - **Images** pasted or dropped into the composer go with the message as image blocks (not with
     the app's retries); the chat notes how many.
   - **Plan review:** `ExitPlanMode` requests show as a plan card: approve and accept edits (a
     `setMode` permission update), approve and keep asking, or keep planning (denied, with a message
     asking the agent what to change).
   - **A mode chosen before a conversation's first message** is the one it starts in, as in the
     terminal. `POST mode` now names its conversation, so a mode chosen for a new conversation
     doesn't change the session still open from the last one.
   - Verified in Chrome on a copy: the model list, `/comp` offering `/compact`, a dropped image read
     correctly by the picked model, the usage line, and a plan approved with edits accepted (the
     file written, the mode switched to accept edits).
6. ~~**Cleanup**~~: done. The `--restricted`-era code (`agentArgs`, `agentAuth`, the widget checks,
   the prompt's pointers to docs) went in phase 2. Here: `ENGINEERING_STANDARDS.md` and
   `FUNCTIONAL_CORE.md` are deleted (the skills in `.claude/skills/` hold their content), and the
   links to them in README, VISION, SELF_BUILDING and MFE_FRAMEWORK point at the skills instead. The
   conversation store lost its widget-era keys (the window's conversation keeps its storage key).
   The `repo-layout` skill now covers the two services.

Each piece follows the repo's functional core pattern: the event log, turn state machine, permission
bookkeeping and restart decisions are core logic with plain tests; the SDK, the HTTP server,
`launchctl` and the PiP window are shells.

## Decisions

- **Port:** the assistant service listens on 9443.
- **Services:** two launchd jobs, plus a `restart-service` convenience task.
- **Permissions:** sessions start in `default` mode, as in the terminal, including resumed ones
  (overriding the mode the SDK would restore).
- **Checks:** no app-run checks after a turn; the agent and your settings handle it, as in the
  terminal.
- **Column widget:** removed.
- **Concurrency:** one turn at a time across the app. A tabbed, turn-per-session UI can come later.
