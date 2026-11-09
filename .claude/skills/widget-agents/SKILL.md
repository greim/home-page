---
name: widget-agents
description: AI-powered widgets — giving a widget its own Claude agent, purpose-built for one task (check grammar, summarize, classify, extract), sandboxed with no tools, answering with data in a declared shape. Use when a widget should use AI, when writing or changing an agent's instructions or output schema, or when touching src/server/widget-agents.ts or the kit's runWidgetAgent.
---

# Widget agents

A widget can do part of its work with Claude, through an **agent**: Claude with one job, the
widget's instructions as its whole system prompt, and nothing else. It's not the assistant:

- **No tools at all.** It can't read or write files, run commands, search the web, use MCP servers
  or skills, or start subagents. It's given input, and it answers.
- **None of the user's setup.** Their Claude Code settings, CLAUDE.md, hooks and skills aren't
  loaded, and Claude Code's own (coding assistant) prompt is replaced by the widget's instructions.
- **A declared answer.** It must answer with data matching the output schema the widget declares
  (structured output, checked by Claude Code, which retries the model if it doesn't fit).
- **Bounded.** Each run has a turn limit, a cost cap and a three-minute time limit, and runs in an
  empty folder that's deleted afterwards. Runs aren't saved as sessions.

The assistant service runs agents (`src/server/widget-agents.ts`, at
`POST /api/widget-agents/{widget}/{agent}`), reading them from the widget registry on each run. The
grammar checker, `src/client/widgets/grammar-check/`, is the worked example.

## Declaring an agent

In the widget's `manifest.ts`, under `agents`, keyed by a name (lowercase, hyphens):

```ts
agents: {
  check: {
    title: "Grammar check",
    instructions, // the whole system prompt: a const string in the manifest
    output: GrammarReport, // an Effect Schema, usually in its own module
    model: "claude-sonnet-5-5", // optional; the user's default otherwise
    maxTurns: 4, // 1 to 20; structured output can take a retry or two
    maxBudgetUsd: 0.5, // 0.01 to 10
  },
},
```

And declare where the data goes. Everything a widget sends its agent goes to Anthropic, so a widget
with agents must name Anthropic under `permissions` (the build fails otherwise), saying what it
sends in plain words. The user then consents before the widget runs (see "Sending data to outside
services" in the `code-vs-data` skill).

```ts
permissions: {
  services: [{
    name: "Anthropic (Claude)",
    sends: "The text you check, so Claude can review it, using your Claude Code login",
    privacyPolicy: "https://www.anthropic.com/legal/privacy",
    terms: "https://www.anthropic.com/legal/consumer-terms",
  }],
},
```

## Running it from the widget

```ts
import { runWidgetAgent } from "../../widget-kit/agents.ts";

const result = await runWidgetAgent("grammar-check", "check", { text }, GrammarReport);
if (result.ok) show(result.value, result.costUsd);
else showError(result.errorMessage);
```

- The input is any JSON. The agent sees it as data, framed as material to work on, not instructions.
- It never rejects: failures (no such agent, over budget, a timeout, an answer that doesn't fit)
  come back as `{ ok: false, errorMessage }`, worded for the user.
- Call it only from the widget's `widget` or `full-screen` view, on a user's action: never from its
  editor, or from code that runs when the bundle loads (those run before consent).
- Runs take seconds and cost money. Show that it's working, and show `costUsd` when it's done.

## Writing the instructions

- Say who it is and what its one job is, then exactly what to look for and what to leave alone.
- Describe what each output field means, both in the instructions and as `description` annotations
  on the schema's fields: the build turns those into the JSON Schema the model sees.
- When the widget will find the model's text in the user's input (to highlight or replace it), ask
  for it copied **exactly**, and handle not finding it anyway: models paraphrase.
- Don't tell it about tools, files or the app: it has none of them. A note saying so is added for
  you.
- The input can contain text written to manipulate the model. With no tools, the worst it can do is
  give a wrong answer, so the widget must treat the answer as untrusted data: show it, don't execute
  or navigate to anything in it.

## Testing

- Keep the schema and everything the widget does with the answer (applying a fix, sorting,
  formatting) in plain modules with tests, like any widget logic. Tests never call the agent.
- To try a run by hand: `deno task build-widgets`, restart the assistant service
  (`deno task restart-service assistant`, or ask the developer), then use the widget. Or post to the
  route with an `origin` header of the page:
  `curl -k -X POST https://localhost:9443/api/widget-agents/grammar-check/check -H 'origin: https://localhost:8443' -d '{"input":{"text":"Teh cat"}}'`.
  Each run costs a little of the user's Claude usage.

## Not yet

These need platform work first (ask the developer; don't build them inside a widget): files in or
out, tools the widget defines for its agent, follow-up questions on a result, and skills for an
agent. The design notes for them are kept by the developer.
