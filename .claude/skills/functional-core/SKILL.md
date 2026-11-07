---
name: functional-core
description: The Functional Core / Imperative Shell pattern this repo uses to separate decisions from I/O. Use when designing or refactoring a module that does I/O, adding a server route, pipe or logic module, or extracting logic from a React component.
---

# Functional core / imperative shell

Write code in a purely functional style whenever possible. When code must do I/O, split it into
three parts that keep _branching logic_ (ifs, ternaries, error handling, null checks: anything that
creates multiple paths) apart from _I/O_ (disk, network, clock, randomness, environment variables,
other system APIs).

## Why

Branching logic is what drives the number of tests. I/O is what makes a test expensive, because it
forces monkey-patching to intercept. Keeping the two apart makes most tests cheap: the many decision
tests need no patching, and the I/O layer, having no branches, needs just one complex test. Say a
program needs 100 tests to cover its decisions, and a patched test costs twice a plain one. Mixed
together, it costs 200. Separated, it costs 100 + 2. Low test complexity means low cognitive
overhead for humans and LLMs alike.

## The three parts

### 1. The I/O interface: a patch bay of dumb pipes

A dumb pipe is like a patch cable: plug it in and the signal flows. It does no processing of its
own. A cache read and a store read are always _separate_ pipes. Never hide a cache miss or fallback
inside a pipe; the core orchestrates them.

Designing it should feel like naming sources and destinations, not abstracting away details.

### 2. The functional core: thick, owns every decision

It holds all error handling, null checks and business logic. It never does I/O directly. The I/O
interface is injected as a dependency and the core calls its pipes.

It needs many unit tests, because it makes many decisions, but each test is simple: it provides a
fake I/O interface, which is easy because it's only a set of dumb pipes.

### 3. The imperative shell: thin, no branching

It implements the I/O interface, provides it to the core, and runs the core (or hands the resulting
effect elsewhere).

- No `if`, ternary, `try/catch` or other conditional. Most pipe implementations are one-liners.
- Building a client from config, e.g. on cold start from env vars, is fine: that's a value flowing
  into a constructor, not a decision.
- Choosing between _implementations_ (a real client vs. a fake, picked by an `if`) is a decision,
  and doesn't belong in the shell.
- It gets exactly one small integration test. See the `testing` skill.

## Read the environment only at the entry point

Env vars may parameterize the program, but read them only in the entry point and pass them on as an
I/O dependency. Re-reading the environment throughout the program makes it hard to reason about and
test.

## React components

Components are shell code, but rendering is inherently conditional (loading vs. ready, collapsed vs.
expanded, admin vs. normal), so "no branching" can't apply to JSX literally. Apply its intent:

- Keep _decisions_ (layout math, validation, state transitions, parsing) in plain, tested modules
  that components call.
- Branching left in a component should only choose what to render from values those modules produce.
- A component that's accumulating real logic is a signal to extract a module.

## Implementation

Use Effect for this pattern in server code, I/O pipes and logic modules: `Context.Tag` for the I/O
interface, `Layer` for the live implementation, `Effect.provideService` with fakes in tests. See the
`effect-errors` skill for where Effect is and isn't required. A complete worked example (cache plus
store, with core tests) is in [example.md](example.md).

This is essentially Hexagonal / Ports and Adapters, expressed in TypeScript idioms rather than Java
or C# ones.
