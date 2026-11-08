---
name: code-vs-data
description: What in this repo is source code (committed, like any dev's work) versus user data (private, never committed). Use when writing widgets, deciding where to persist something, handling API keys, uploads or layout.json, or before committing.
---

# Code versus data

This app develops itself. Its in-page assistant is just another frontend to Claude Code, used by a
developer running the app on localhost out of a repo they cloned. That gives two very different
kinds of output, and they must never be confused.

## Code: the assistant's work is the developer's work

Anything the assistant writes as source (widgets under `src/client/widgets/<id>/`, server changes,
tooling, tests, docs) is code. Treat it exactly as if the developer had typed it:

- It belongs in the repo and is committed and merged by PR like any other change.
- It is not private, sandboxed or "user-generated content". Don't hide it, gitignore it, or store it
  outside the source tree.
- The assistant should have the same privileges as the developer. Don't propose sandboxing or
  permission layers for agent-written code on the grounds that it's untrusted user data.

## Data: what the user puts into the app is private

What the user enters, uploads or configures _through the app_ is user data in the traditional sense:
sensitive, specific to one person, and **never committed**. This includes:

- `data/layout.json`: their columns, widgets, bookmarks, snippets, settings.
- Uploaded files: any photos, spreadsheets or other files a widget accepts.
- The assistant's working files in `data/assistant/`.
- Secrets such as API keys and tokens that widgets need.
- Anything a widget fetches or holds on the user's behalf.

### Where it lives

| Sensitivity         | Examples                                    | Store in                                                        |
| ------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Extremely sensitive | API keys, tokens, passwords                 | The browser's `localStorage`, owned by the widget that needs it |
| Sensitive           | `layout.json`, uploads, assistant workspace | `data/` (gitignored; paths in `src/server/config.ts`)           |

Secrets in `localStorage` stay in the browser. The widget prompts for the key and keeps it there.
Never send it to the server, write it into `layout.json` or a widget's config, put it in a log, or
put it in the assistant's prompt. Neither git nor the agent should ever see it.

## Sending data to outside services

Useful widgets often send something to an outside API: addresses to a geocoder, a search to a
service, a location to a weather API. What's sent is the user's data, so:

- **Never commit it.** Not the data a widget sent or received, and not samples of it (fixtures,
  examples, docs, screenshots). Made-up data only, as above.
- **Declare every outside service in the widget's manifest**, as `permissions`: who it is, what the
  widget sends it in plain words ("The street addresses in the CSV you load, not the names"), and
  https links to its privacy policy and terms of service. Be specific and complete: this is what the
  user agrees to. A widget that sends nothing anywhere leaves `permissions` out.
- **The page asks the user, not the widget.** Until the user has read the services and agreed, the
  page loads none of the widget's code: its card shows a notice and a Review button, which opens the
  permission screen. The answer is kept in the browser's `localStorage`, once per widget type, and
  the column editor shows it with a way to change it. If the manifest's services change, the user is
  asked again. Don't build a consent screen into a widget; the page's is the one.
  (`src/client/permissions.ts` and `permissions-view.tsx`.)
- **Send only what the service needs**, and say so in `sends`. If names aren't needed to look up an
  address, don't send them.
- **Change `permissions` whenever what's sent changes**: a new service, or more data to one. Sending
  something the manifest doesn't declare breaks the user's trust in every widget's notice.
- Maps and other things that load content from outside servers (tiles, images, fonts) count too: the
  request tells that server what the user is looking at.

The permission is a consent step, not a sandbox: once the user agrees, the widget's code runs in the
page like any other. What keeps it honest is the manifest being accurate, and reviewed with the
code.

## Rules when writing code

- Never `git add -f` anything under `data/`, `.secrets/` or `logs/`, and never remove those entries
  from `.gitignore`.
- Never copy user data into code: no hardcoding the user's real bookmarks, URLs, names or layout as
  defaults, fixtures, examples or test data. Write made-up fixtures instead.
- Keep user data out of commit messages, PR descriptions, docs and screenshots you commit.
- A new widget that needs a secret gets an input for it and keeps it in `localStorage`. Its config
  schema (in `manifest.ts`) holds only non-secret settings.
- A new widget that accepts files sends them to the server to be stored under `data/`. Uploads never
  go anywhere in the source tree.
- If you're unsure whether something is code or data, ask: "would a different developer cloning this
  repo want it?" Code: yes. Data: no, it's this user's.
