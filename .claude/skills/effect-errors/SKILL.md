---
name: effect-errors
description: Error handling and where to use the Effect library in this repo — no try/catch for control flow, typed errors via Effect, letting true exceptions propagate, and Effect only at the boundary in React. Use when handling errors, calling APIs that throw, or deciding whether code should use Effect.
---

# Error handling and Effect

## Never use try/catch for control flow

Don't use `try/catch`, or its Promise analogs (`.catch()`, `.then(_, onRejected)`), to handle
errors. When a system or library API throws or rejects as part of its normal functioning, wrap the
call in Effect (`Effect.try`, `Effect.tryPromise`) so the failure becomes a typed value:

```ts
const readLayout = (path: string) =>
  Effect.tryPromise({
    try: () => Deno.readTextFile(path),
    catch: (cause) => new ReadError({ cause }),
  });
```

From there:

- **Server code, I/O pipes and logic modules:** stay in Effect's error channel (`Data.TaggedError`,
  `Effect.catchTag`, `Effect.mapError`, etc.).
- **React components:** run the effect at the boundary and hand the component a plain result, such
  as an `Either` or a discriminated union like
  `{ ok: true; value: T } | { ok: false; errorMessage: string }`.

## Let true exceptions propagate

Some errors aren't part of the program's normal functioning; they mean something is genuinely
broken. Don't catch these. Let them reach a higher-level handler:

- the HTTP server framework, which turns them into a 500,
- the Deno runtime, which crashes the program, or
- React, which blanks the screen or triggers an error boundary.

(In Effect terms, these are defects: `Effect.die`, not `Effect.fail`.) The philosophy borrows from
Rust and Go: expected failures are values, bugs crash.

## Where to use Effect

**Strongly recommended** for:

1. **Server code**: request handling and everything it orchestrates.
2. **I/O pipes**: the I/O interface and its implementations (see the `functional-core` skill).
3. **Logic modules**: functional-core code that makes decisions over injected I/O, or handles errors
   as above.

**Not required in React components.** React has its own model for state, effects and rendering, and
threading Effect through it adds ceremony without much payoff. In UI code, Effect's role shrinks to
the boundary: wrap a throwing API (or call an Effect-based logic module), run it, and give the
component a plain value.

Pure helpers that components use (layout math, parsing, validation) should be plain functions
returning discriminated unions. Use Effect there only if they genuinely orchestrate I/O.

**Why the line is drawn here:** Effect is close to a dialect of TypeScript. Every contributor must
learn it and the codebase depends on it deeply. That cost is clearly repaid where dependency
injection and typed errors matter most, and much less so in rendering code.

For validating and decoding data, use Effect Schema (not zod).
