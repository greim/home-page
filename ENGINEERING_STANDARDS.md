# Engineering Standards

## Language

All components of the app MUST be written in TypeScript with `strict` enabled.

## Repo Layout

```
$REPO_ROOT
|--bin/ — Executable scripts
|--tooling/ — TypeScript source code supporting builds
`--src/ — TypeScript source code supporting the app
   |--client/ — strictly limited to code targeting the browser
   |--common/ — code shared between client and server, MUST be runtime-agnostic
   `--server/ - strictly limited to code targeting the server
```

Compilation does NOT emit `.js` files into `lib/` or similar. Instead, the webserver runs TypeScript
directly via Deno. All unit tests live as **siblings** to the modules they test. Modules and their
tests have the naming format `{module}.{extension}` and `{module}.test.{extension}`. Modules must
never be named "index"; choose a descriptive name.

## The Functional Core Pattern

Software components should be written in a purely functional style whenever possible. Otherwise, use
the [Functional Core pattern](./FUNCTIONAL_CORE.md).

Edge case: **React components are shell code, but they branch.** Rendering is inherently conditional
(loading vs. ready, collapsed vs. expanded, admin vs. normal mode), so the pattern's "no branching
in the shell" rule can't apply to JSX literally. Apply its intent instead. Keep _decisions_ (layout
math, validation, state transitions, parsing) in plain, tested modules that components call, and
keep the branching left in components to choosing what to render from values those modules produce.
A component that's accumulating real logic is a signal to extract a module.

## Error Handling

NEVER use try/catch (or their Promise API analogs) for error control flow. If system- or
library-level APIs throw or reject as part of their normal functioning, wrap those calls in
[Effect](https://effect.website/) (e.g. `Effect.try`, `Effect.tryPromise`) so the failure becomes a
typed value. In server code, I/O pipes, and logic modules, use Effect's error flow semantics from
there on. In React components, run the effect at the boundary and hand the component a plain result
value (e.g. an `Either`, or a discriminated union like
`{ ok: true; value: T } | { ok: false;
errorMessage: string }`). See below.

A subset of errors are _not_ expected as part of a program's normal functioning, and are thus truly
exceptional. These _true exceptions_ should NOT be caught, but rather be allowed to propagate to a
higher level handler, for example:

- To the HTTP server framework, where they'll cause a 500 error.
- To the Deno runtime, where they'll crash the program.
- To React, where they'll either blank the screen or trigger an error boundary.

This philosophy borrows from concepts in Rust and Go.

## Where to Use The Effect Library

The [Effect library](https://effect.website/) is **strongly recommended** for:

1. **Server code**, including request handling and anything it orchestrates.
1. **I/O pipes**, i.e. the I/O interface and its implementations (see the
   [Functional Core pattern](./FUNCTIONAL_CORE.md)).
1. **Logic modules**, meaning _functional core_ code that makes decisions over injected I/O, or that
   handles errors as referenced above.

Effect is **not required in React components**. React has its own model for state, effects, and
rendering, and threading Effect through it adds ceremony without much payoff. In UI code, Effect's
role shrinks to the boundary: wrap a throwing or rejecting API (or call into an Effect-based logic
module), run it, and give the component a plain value to render. Pure helpers that components use
(layout math, parsing, validation) should be plain functions returning discriminated unions. Only
reach for Effect there if they genuinely orchestrate I/O.

Why the distinction: Effect is close to a dialect of TypeScript. Every contributor has to learn it,
and the codebase takes a deep dependency on it. That cost is clearly repaid where dependency
injection and typed errors matter most, and much less so in rendering code.

## Other Notes

### Use Discriminated Unions

For maximum type clarity and safety, use discriminated unions early and often. When writing
discriminated unions, prefer discriminants named `is` over longer ones named `type` or `kind`. This
allows code to read both briefly and naturally:

```ts
if (status.is === "in-progress") {
  log(`${status.percentage}% complete`);
  continue;
}
```

For even greater clarity, use boolean discriminants when possible:

```ts
if (result.ok) {
  return result.value;
} else {
  log(result.errorMessage);
}
```

### Assert Exhaustivity When Possible

When processing over a known union, assert exhaustivity using the `satisfies` keyword.

```ts
switch (status.is) {
  case "in-progress":
    log(`${status.percentage}% complete`);
  case "not-started":
    await wait(1000);
  case "failed":
    log(`operation failed`);
    return;
  case "success":
    log(`operation succeeded`);
    return;
  default:
    return status satisfies never;
}
```

### TypeScript's Optionality Operator

```ts
interface Person {
  id: string;
  name: string;
  tagline?: string; // <-- optional
}
```

NEVER use TypeScript's optionality operator (`?`) as a synonym for possibly-undefined. While it does
carry that meaning, it has other implications that can negatively affect the codebase, if not used
carefully.

Namely, it means the field isn't type-checked for _presence_ at the callsite, tacitly allowing you
to forget it, which may not be what you intend. For example, you have a possibly-undefined variable
which you intended to supply to the optional field. But you forgot, and TypeScript allowed it.
That's a real software bug, because the field is now _always_ undefined, even if a value was
available.

Only use the optionality operator when an API has multiple use cases, some of which truly treat the
field as optional. Even then, be careful. Consider alternatives like discriminated unions.

Edge cases:

- **Third-party APIs.** Libraries (e.g. Chakra component props) declare their own optional fields.
  Supply them as the library expects. The rule governs types _we_ declare.
- **Persisted data gaining a field.** Data saved before the field existed won't have it, which
  tempts you to mark the field optional. Instead, keep it required in the decoded type and give old
  data a default at the decoding boundary, e.g. Effect Schema's
  `Schema.optionalWith(X, { default: () => … })`. Code reading the decoded value never sees
  `undefined`, and every place that constructs one is still checked for presence.

### Avoid Random Access Via Bracket Accessors

JavaScript allows properties on a `Record<string, T>` (or similar) to be accessed via bracket
notation:

```ts
const value = myRecord[key];
```

Similarly, it allows array elements to be accessed via brackets:

```ts
const value = myArray[index];
```

In random-access scenarios — that is, outside the context of iteration over the access key (`key` or
`index`) — some type-unsafety leaks in, since TypeScript masks the potential for `value` to be
undefined.

For arrays, the solution is simple: use `.at(index)` instead.

```ts
const value = myArray.at(index); // T | undefined
```

Edge case: unlike bracket access, `.at()` treats **negative indexes as counting from the end**.
`myArray[-1]` is `undefined`, but `myArray.at(-1)` is the _last_ element. So computed neighbors like
`items.at(i - 1)` silently return the last item when `i` is `0`, rather than `undefined`. Guard the
lower bound explicitly (`i === 0 ? undefined : items.at(i - 1)`) whenever an index can go negative.

For `Record<string, T>` (or similar) the picture isn't as simple. You have a few options, in order
of most to least-preferred:

1. Use `Map<string, T>` instead
2. Annotate the accessed value at the access point — techniques vary
3. Use `Record<string, T | undefined>` instead

### Code Should be Routinely Compiled, Formatted, Linted, and Unit Tested

Compile, lint, and test should happen during a routine build. Unit test coverage benchmark is _90%
minimum_ across all stats. Auto-formatting should be available as a Deno task. Linting should (if
possible) fail if the code requires auto-formatting changes.

### NEVER Break Isolation in Functional Core Unit Tests

Isolation breakage consists of unit tests needing to use setup/teardown hooks
(`before`/`beforeEach`, etc.), mock imports or classes, modify the environment, or otherwise monkey
patch the runtime.

If you find yourself using these techniques, it means one of:

1. You're testing the imperative shell. If you're using functional core / imperative shell
   correctly, the quantity of these kinds of tests should be vanishingly small. For example, if we
   have a goal of 90% test coverage, imperative shell code has the worst cost-benefit tradeoff, and
   is thus the last thing we care about covering; leaving us well within our 10% coverage cushion.
2. You're testing code that should be migrated to the functional core / imperative shell pattern.
   Consider this your signal for migration.
3. You're reaching for a testing technique that isn't really necessary. Consider an alternative.

Otherwise, it should be possible to test functional core modules without breaking isolation.

### Every Imperative Shell Gets At Least One Integration Test

Every imperative shell should have at least one integration test that wires the real pipe
implementations to the core and runs them end to end. Its purpose is narrow: confirm we've "plugged
in" the right things. That means two checks:

1. **Wiring.** The right path, URL, or implementation went into each slot. ("Does it write to the
   correct file?")
2. **Contract.** The real pipe behaves the way the core's mocks assume. Core tests are only as good
   as the fake pipes they run against, and those fakes encode assumptions about reality: the file
   name the bundler actually produces, the error a missing file actually raises, the format a
   service actually returns. The shell test is the only place those assumptions meet reality.

Decisions are _not_ its job. "Will it skip step X if it already ran?" is a core-side decision, and
must be fully covered by core tests. So a shell test stays small, with no branches to explore. If a
shell starts needing several test cases, logic has leaked into it. Move that logic into the core.

- Run against **real but disposable resources** wherever possible: a temporary directory, an
  ephemeral port, a local test server, the real bundler. This catches far more than mocking the
  pipes again, and often needs no monkey-patching at all.
- Isolation breakage (setup/teardown, environment changes, patched imports) is acceptable here. That
  is exactly the cost the functional core pattern concentrates into these few tests.
- Where a shell's effects can't be safely sandboxed (e.g. trusting a certificate in the system
  keychain, registering a launchd service, calling a paid third-party API), write the integration
  test against the parts that can be exercised, and document the rest as a manual verification step
  next to the code.
