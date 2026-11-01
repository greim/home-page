# Unibrain friction log

Running log kept while implementing AI_INTEGRATION.md (admin bar + admin assistant) in home-page,
2026-11-01. Each entry: what happened, and whether Unibrain helped (+), got in the way (-), confused
(?), was noisy (~), or was missing something (0).

## Session start

- (~) First search, "home-page portal configuration scheme": 4 hits, all about CSS/Chakra/puppeteer
  from this same project. No relevance score in the results, so I couldn't tell "strong match" from
  "the only things in the corpus". Two more searches ("claude code headless -p stream-json resume
  session", "spawn subprocess Deno.Command stream stdout lines") returned essentially the same ~10
  resources in a different order. Search never says "nothing relevant"; I had to read every
  description to conclude there was nothing on Claude Code headless mode.
- (0) Nothing on driving the `claude` CLI headlessly (flags, stream-json event shapes, session
  resume, permission confinement), the core unknown for this feature. Found it myself by experiment
  (~3 tool calls) and saved it as `pztdfb`.
- (?) I was started by a relay message, not a user prompt, so the UserPromptSubmit hook never ran:
  no injected hints at the start, which is exactly when they're most useful.
- (+) Several hits were relevant later even though they didn't match the query: the Effect
  `Context.Tag` gotcha, `assertEquals` vs TaggedError, `Schema.optionalWith` for persisted fields,
  the puppeteer e2e recipe for this app.

## Implementation

- (-) `unibrain_create` rejected my first save: "description must be one line of 1 to 200
  characters". Clear error, but the limit isn't in the server instructions, so I wasted a ~2.4 KB
  round trip. The instructions could state the limit, or the server could truncate and warn.
- (0) Searched "effect Stream asyncScoped emit toReadableStream" and "Deno.Command child process
  kill abort signal": nothing. I went to Effect's `.d.ts` in node_modules instead (fast). Not worth
  saving, since any agent can grep the types.
- (+) `n5sf4t` (puppeteer + system Chrome against a copy of this app on another port) was the
  biggest time saver of the session. It gave me the driver script, the "copy the repo and change the
  port" approach, and "kill test servers by port, not pattern". It saved maybe 10-15 minutes and a
  risk of touching Greg's real data. Rated useful.
- (+) `p9vnf9` (Chakra `Theme appearance="light"`) is exactly what the always-white admin bar and
  chat panel needed on a page that follows the OS dark mode. Rated useful.
- (~/+) `t4j4fd` (CSS `corner-shape: squircle` through Chakra's `css` prop) confirmed the approach
  I'd already copied from the codebase. But it never came up when I searched for related things,
  only by accident on an unrelated query ("react useEffect destroy is not a function ..."). Both
  ranking and recall look keyword-luck based.
- (0) Hit a real gotcha: in Chrome 156 `scrollIntoView()` returns a Promise, so
  `useEffect(() => el.scrollIntoView())` crashes React ("u is not a function"). Searched first,
  nothing; diagnosed from the minified stack and a probe; saved as `fqcyh3`. The PostToolUseFailure
  hook didn't fire because the failing command was a puppeteer run that exited 0 and _printed_ the
  page errors. Hooks only see failures that set an exit code.
- (~) The UserPromptSubmit hook fired on a background-task _notification_ (a system event, not a
  user prompt) and suggested `pztdfb`, which I had written 30 minutes earlier in this same session.
  Two issues: it treats harness notifications as prompts, and it doesn't skip resources the current
  session authored.
- (?) There's no way to see "what did _I_ save this session?" short of remembering ids. A
  `session: me` filter in search would help with self-review before finishing.

## The feature's own agent (Unibrain as its only MCP server)

- (+) This is where Unibrain clearly earned its keep. Four fresh conversations against a copy of the
  server, each with no shared context:
  1. Searched "home page layout json schema": nothing; read `model.ts`; saved note `4w2ce8`. $0.25 /
     25s.
  2. Found `4w2ce8`; wrote, saved and used a validator + UUID program `2t53cw`; updated the note to
     point at it. $0.30 / 49s.
  3. Note + program only, no source reads. $0.12 / 17s.
  4. Same (driven through the real UI). $0.09 / 11s.
- (+) Giving the embedded agent a _literal_ search phrase in its system prompt made recall
  deterministic: every session searched exactly "home page layout json schema" and got the note
  first. Saved this lesson as `ytqq4y` (tag "unibrain").
- (?) The validator `2t53cw` is a hand-written mirror of `src/common/model.ts`. When the schema
  changes it silently drifts, and nothing in Unibrain records that it was derived from that file.
  The app's server-side validation is authoritative, so drift costs a retry rather than a broken
  page, but the program will keep passing layouts the app rejects.
- (~) The agent rates its own previous session's creations "useful" (`4w2ce8` and `2t53cw` both got
  +1 from the agent that next used them, which was effectively the same agent). Ratings from one
  embedded agent can inflate quickly with no outside signal.
- (?) The embedded agent runs with `--restricted`, which ignores user settings, so it gets none of
  Unibrain's hooks (prompt hints, stop-time "save what you learned"). The system prompt has to do
  all the nudging. That worked here, but the hooks' "already shown this session" logic is also lost.

## Ranked improvement ideas (by expected impact)

1. **Relevance scores + an honest "no good match" in search.** Return a score per hit and drop or
   flag hits below a threshold. Today every query returns most of a small corpus, so agents must
   read every description to learn that nothing matches, and real matches (`t4j4fd`) get buried or
   missed. This is the most frequent cost: every search, every agent.
2. **Provenance / staleness for derived resources.** Let a resource declare what it was derived from
   (a file path + content hash, a package@version, a URL), and have read/search flag it as possibly
   stale when the source has changed (or when an agent reports "the source changed"). The
   schema-mirroring validator is the canonical case, and it's exactly the "agents accumulate
   programs" scenario Unibrain is built for.
3. **Hint delivery that doesn't depend on a human prompt.** Agents started by relay, SDK or `-p`
   with `--restricted` get no UserPromptSubmit hint. Options: an MCP-side "start of session" nudge
   (search the initial task automatically when the first tool call arrives), or a documented
   `--settings` hooks snippet for embedded agents. Also: skip harness notifications, and skip
   resources authored by the current session.
4. **Failure hints from more than Bash exit codes.** Many real failures show up as error text in
   successful commands (test runners, puppeteer page errors, `deno check` output piped through
   grep). A PostToolUse hook that scans output for error signatures (not just PostToolUseFailure)
   would have offered help on the React crash.
5. **Rating hygiene.** Weight or label ratings by source: authored-by-same-session, same client, or
   distinct agents. Show "useful 1 (self)" vs "useful 1 (independent)".
6. **State limits in the instructions** (200-char single-line description, any tag limits), or
   truncate with a warning rather than reject.
7. **"My contributions this session"** filter (search or list by session), for review before
   finishing and for the stop hook to show what was saved.
