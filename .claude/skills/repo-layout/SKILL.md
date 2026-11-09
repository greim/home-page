---
name: repo-layout
description: Where code goes in this repo (bin, tooling, src/client, src/common, src/server), file naming rules, and the deno tasks for check, format, lint, test and build. Use when creating files or modules, choosing where code belongs, or verifying a change.
---

# Repo layout and build

```
$REPO_ROOT
|--bin/        executable scripts
|--tooling/    TypeScript supporting builds
`--src/        TypeScript for the app
   |--client/  browser-only code
   |--common/  shared by client and server; MUST be runtime-agnostic
   `--server/  server-only code
```

- `src/common/` must not touch browser globals or Deno APIs. Anything runtime-specific goes in
  `client/` or `server/`, injected into common code if needed.
- One exception in `client/`: a widget's `agent-tools.ts` runs in Deno (the tools its AI agent
  calls, sandboxed by the assistant service), never in the browser. It and what it imports must not
  touch browser globals; it's never imported by the widget's `main.tsx`. See `widget-agents`.
- Nothing compiles to `.js` in `lib/` or similar: the server runs TypeScript directly with Deno.

## Naming

- A module and its test are `{module}.{ext}` and `{module}.test.{ext}`, side by side in the same
  folder.
- Never name a module `index`. Choose a descriptive name.

## Verifying a change

| Task              | What it does                               |
| ----------------- | ------------------------------------------ |
| `deno task check` | type-checks `src/`, `tooling/`, `bin/`     |
| `deno task fmt`   | auto-formats                               |
| `deno task lint`  | fails if formatting is needed, then lints  |
| `deno task test`  | runs tests with the 90% coverage threshold |
| `deno task build` | all of the above, then builds widgets      |

Run `deno task fmt` and then `deno task build` before calling a change done.

## The two services

The app runs as two processes, each a launchd job (installed by `deno task setup`):

| Process                                                   | Entry point                    | Port | Log                  |
| --------------------------------------------------------- | ------------------------------ | ---- | -------------------- |
| The main server (page, layout API, widget files)          | `src/server/main.ts`           | 8443 | `logs/server.log`    |
| The assistant service (Claude Code through the Agent SDK) | `src/server/assistant-main.ts` | 9443 | `logs/assistant.log` |

- `deno task restart-service [app|assistant]` restarts them (both by default) and waits until they
  take connections again. The main server takes a few seconds longer than the assistant: it bundles
  the page and builds the widgets first.
- To run them by hand beside the installed ones, use other ports:
  `PORT=8444 ASSISTANT_PORT=9444 deno task dev` and the same with `deno task start-assistant`.
- `deno task setup` checks the machine and both services, and offers to fix what's wrong. It's
  interactive: it's for people at a terminal, not for you to run.
- When you are the assistant built into the page, don't restart them yourself: when your turn ends,
  the assistant service compares the repo with how it was and restarts whatever your changes need
  (see `src/server/restarts.ts`).
