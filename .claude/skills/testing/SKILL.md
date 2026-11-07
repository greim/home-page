---
name: testing
description: How tests are written in this repo — sibling test files, 90% coverage, isolated functional-core tests with no mocks or hooks, and one integration test per imperative shell. Use when writing, fixing or reviewing tests.
---

# Testing

Tests use `Deno.test` and `@std/assert`. Run them with `deno task test`; the full build is
`deno task build` (check, lint, test, build widgets). Coverage must stay at **90% minimum** across
all stats; the test task enforces it.

## Where tests live

Every test is a **sibling** of the module it tests: `foo.ts` → `foo.test.ts`, `bar.tsx` →
`bar.test.tsx`.

## Functional core tests: never break isolation

Core tests provide fake I/O pipes as the injected dependency (see the `functional-core` skill). They
must **not**:

- use setup/teardown hooks (`beforeEach`, etc.),
- mock imports or classes,
- modify the environment, or
- otherwise monkey-patch the runtime.

If you find yourself reaching for one of these, it means one of three things:

1. **You're testing the imperative shell.** These tests should be very few. Shells have the worst
   cost-to-benefit ratio for coverage and are the last thing to cover; the 10% coverage cushion is
   meant for them.
2. **The code should be migrated to functional core / imperative shell.** Treat it as the signal to
   refactor, and do that rather than writing the patched test.
3. **The technique isn't needed.** Find an alternative.

## Shell tests: exactly one integration test each

Every imperative shell gets at least one integration test that wires the real pipe implementations
to the core and runs them end to end. It checks two things only:

1. **Wiring.** The right path, URL or implementation went into each slot. ("Does it write to the
   correct file?")
2. **Contract.** The real pipe behaves the way the core's fakes assume: the file name the bundler
   actually produces, the error a missing file actually raises, the format a service actually
   returns. This is the only place those assumptions meet reality.

Decisions are _not_ its job. "Does it skip step X if it already ran?" is a core decision and must be
covered by core tests. So a shell test stays small, with no branches to explore. If a shell needs
several test cases, logic has leaked into it: move that logic into the core.

- Run against **real but disposable resources** wherever possible: a temporary directory, an
  ephemeral port, a local test server, the real bundler.
- Isolation breakage (setup/teardown, env changes, patched imports) is acceptable here. That's the
  cost the pattern concentrates into these few tests.
- If a shell's effects can't be safely sandboxed (trusting a certificate in the system keychain,
  registering a launchd service, calling a paid third-party API), test the parts that can be
  exercised and document the rest as a manual verification step next to the code.
