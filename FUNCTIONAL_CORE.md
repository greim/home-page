# Functional Core / Imperative Shell

_Functional Core / Imperative Shell_ is a design pattern that separates a program's _branching
logic_ from its _I/O_.

## Branching Logic

Concretely, _branching logic_ consists of if statements, ternaries, try/catch, etc, in the code.
More to the point, branching logic is the existence of _multiple paths_ through code. It's how a
program makes decisions — any program would be useless without it.

## I/O

Every program must interact with the real world in some way. For example, display something on
screen, record from a mic, actuate a servo, etc. Otherwise it's just a useless energy-consuming
black box. In practical terms, the OS is the program's gateway to the outside world, providing
access to the network, the disk, random number generators, environment variables, and other
system-level APIs.

This is what we mean by I/O — it's the program's _connection_ to the outside world.

## Why Separate Branching Logic From I/O

### Kolmogorov-ish Testing Complexity

[Kolmogorov Complexity](https://en.wikipedia.org/wiki/Kolmogorov_complexity) measures a string's
complexity as a function of the shortest possible program that can produce that string.

Kolmogorov-ish Testing Complexity (KTC) is a corollary in the programming world, measured as the
simplest possible unit testing layer that can fully cover a given program. A program's KTC score is
inversely proportional to our ability to troubleshoot and refactor it. Explaining why is out of
scope of this doc, suffice to say that testing complexity is the best possible measure of a
program's _cognitive overhead_ — for both humans and LLMs alike.

We're thus incentivized to decrease our program's KTC score. How do we do it? We can't just write
fewer tests. Our program makes decisions; we need some minimum number of tests to cover all paths.
Unless we start dropping functionality, our only option is to drive down the average complexity of
each test.

I/O is the biggest contributor to a test's complexity. It forces us to monkey-patch the runtime in
order to intercept I/O and conduct the test in isolation. But we can't just do less I/O, we might as
well delete our program. Unless we start dropping functionality, our only option is to design the
program such that as many unit tests as possible can skip monkey-patching. Since branching logic
induces the bulk of tests, it means separating I/O from branching logic. Some small subset of tests
remain complex, but the _rest_ become simpler, hence driving down _average_ test complexity.

So that's our motivation — we separate I/O from branching logic in order to reduce average test
complexity, and thus our KTC score. Implemented successfully, the I/O layer only requires 1 test to
fully cover since it contains no branching logic. So even though that test is complex, you only
write it once.

### Thought Experiment

To illustrate this, suppose we assign "KTC tokens" to individual tests:

| Type of test                | KTC Tokens |
| --------------------------- | ---------- |
| Without I/O monkey-patching | 1          |
| With I/O monkey-patching    | 2          |

Now suppose our program needs 100 tests to cover its branching logic (BL). Our KTC theoretical
lower-bound is 100. Two program designs:

| # | Program Design      | Calculation | Why?                     | KTC Score |
| - | ------------------- | ----------- | ------------------------ | --------- |
| 1 | BL and I/O Mingled  | 2 × 100     | All tests monkey-patched | 200       |
| 2 | BL and I/O Separate | 2 + 100     | 1 test monkey-patched    | 102       |

We see that design #2 is very close to our KTC theoretical lower bound.

## The Three Parts

### 1. The I/O Interface

The I/O interface abstracts over a collection of **dumb pipes**. A dumb pipe is analogous to a patch
cable: you just plug it in and the signal flows over it. It doesn't do any internal processing of
its own. For example, cache misses and database reads must never be hidden away inside the dumb
pipe. A cache read and a database read are always separate dumb pipes. Calls to them are
orchestrated by the core.

**Success criteria:** Designing the I/O interface doesn't feel like abstracting away details, it
feels like abstracting away destinations and sources. Similar to creating a patch bay to plug cables
into.

### 2. The Functional Core

Its job is to own all decision making. This includes error handling, null-checks, business logic,
etc. It doesn't do I/O directly. Instead, the I/O interface is injected as a dependency, and the
core reads/writes its dumb pipes as needed. This is the central abstraction that makes separation
possible.

**Success criteria:** The functional requires a large number of unit tests due to the volume of
decisions it makes and the number of code paths it contains, but those tests are simple to write
because no monkey-patching is needed to intercept I/O. Instead they just provide a mock I/O
interface as the dependency, which is simple because it's just a collection of dumb pipes.

### 3. The Imperative Shell

Its job is to implement the I/O interface, provide it to the functional core as a dependency, and
either run the core or hand the resulting effect off to another part of the program.

**Success criteria:** The shell is thin, because it contains no branching logic — no if statements,
try/catch, ternaries, or other conditionals. Implementing the I/O interface feels like plugging in
cables. Many of the dumb pipe implementations are one-liners. One unit test is all that's needed to
fully cover it.

**Note:** Real shells often do more than the example below — an AWS Lambda handler, for instance,
instantiating an API Gateway client on cold start using config from env vars. That's still just a
value flowing into a constructor, not a decision, so it doesn't violate the no-branching rule. What
_would_ violate it is choosing between different pipe _implementations_ — e.g. a real client vs. a
mock, picked by an `if`. That's decision-making, and it doesn't belong in the shell any more than it
belongs in the core.

## Technology Choice: Effect — https://effect.website/

Effect is a TypeScript library. It's a natural fit for implementing this pattern due to its
dependency injection mechanism. When implementing this pattern, you MUST use the Effect library.
Besides dependency injection, it brings complementary benefits to the table, such as
agent-friendliness and typed error handling.

## Example

```ts
// I/O interface

import { Context, Effect } from "effect";

class Io extends Context.Tag("Io")<
  Io,
  {
    readStore: (id: string) => Effect.Effect<string, IoError>;
    readCache: (id: string) => Effect.Effect<string | undefined, IoError>;
    writeStore: (id: string, json: string) => Effect.Effect<void, IoError>;
    writeCache: (id: string, json: string) => Effect.Effect<void, IoError>;
  }
>() {}
```

```ts
// Functional Core --- THICK

import { Data, Effect } from "effect";

class IoError extends Data.TaggedError("IoError")<{ cause: unknown }> {}
class ReadError extends Data.TaggedError("ReadError")<{ cause: unknown }> {}
class WriteError extends Data.TaggedError("WriteError")<{ cause: unknown }> {}

class Persistence {
  static read(id: string): Effect.Effect<Item, ReadError, Io> {
    return Effect.gen(function* () {
      const io = yield* Io;
      const cached = yield* io.readCache(id);
      if (cached !== undefined) {
        return JSON.parse(cached) as Item;
      }
      const json = yield* io.readStore(id);
      yield* io.writeCache(id, json);
      return JSON.parse(json) as Item;
    }).pipe(Effect.mapError((cause) => new ReadError({ cause })));
  }

  static write(id: string, item: Item): Effect.Effect<void, WriteError, Io> {
    return Effect.gen(function* () {
      const io = yield* Io;
      const json = JSON.stringify(item);
      yield* io.writeCache(id, json);
      yield* io.writeStore(id, json);
    }).pipe(Effect.mapError((cause) => new WriteError({ cause })));
  }
}
```

```ts
// Imperative Shell --- THIN

import { Effect, Layer } from "effect";
import * as fs from "node:fs/promises";

const readFile = (path: string) =>
  Effect.tryPromise({
    try: () => fs.readFile(path, "utf-8"),
    catch: (cause) => new IoError({ cause }),
  });

const writeFile = (path: string, data: string) =>
  Effect.tryPromise({
    try: () => fs.writeFile(path, data),
    catch: (cause) => new IoError({ cause }),
  });

const IoLive = Layer.succeed(Io, {
  readStore: (id) => readFile(`${ROOT}/${id}.json`),
  readCache: (id) => Effect.sync(() => CACHE.get(id)),
  writeStore: (id, json) => writeFile(`${ROOT}/${id}.json`, json),
  writeCache: (id, json) => Effect.sync(() => CACHE.set(id, json)),
});

function handler() {
  return Effect.runPromise(Persistence.read(id).pipe(Effect.provide(IoLive)));
}
```

```ts
// Core test --- no monkey-patching needed

import { Effect } from "effect";
import { expect, test } from "vitest";

test("read() returns the cached value without touching the store", async () => {
  const item = await Persistence.read("1").pipe(
    Effect.provideService(Io, {
      readCache: () => Effect.succeed(JSON.stringify({ name: "Widget" })),
      readStore: () => Effect.die("should not be called"),
      writeCache: () => Effect.die("should not be called"),
      writeStore: () => Effect.die("should not be called"),
    }),
    Effect.runPromise,
  );

  expect(item).toEqual({ name: "Widget" });
});

test("read() falls back to the store on a cache miss, then backfills the cache", async () => {
  let cached: string | undefined;

  const item = await Persistence.read("1").pipe(
    Effect.provideService(Io, {
      readCache: () => Effect.succeed(undefined),
      readStore: () => Effect.succeed(JSON.stringify({ name: "Widget" })),
      writeCache: (_id, json) =>
        Effect.sync(() => {
          cached = json;
        }),
      writeStore: () => Effect.die("should not be called"),
    }),
    Effect.runPromise,
  );

  expect(item).toEqual({ name: "Widget" });
  expect(cached).toBe(JSON.stringify({ name: "Widget" }));
});
```

## FAQ

### How does this relate to patterns like Hexagonal or Ports and Adapters?

This is mostly a re-hash of those patterns. Most guides for those are focused on non-TypeScript
languages, and make heavily use of Java or C# language idioms. I felt there was a need for a
TypeScript-oriented guide that wasn't bogged down by those idioms.

### Is the term "Functional Core / Imperative Shell" unique to this guide?

No. I first saw the phrase mentioned by Gary Bernhardt of
[Destroy all Software](https://www.destroyallsoftware.com/screencasts). He used Ruby as the example
language, but the term isn't otherwise tied to Ruby idioms.

### Are the terms "Kolmogorov-ish Testing Complexity" and "KTC Score" unique to this guide?

Yes, as far as I know they aren't terms of art in the broader software community. I made them up to
illustrate a point.

### Can this pattern be implemented without Effect?

Yes. Effect is just a natural fit as well as bringing additional benefits.
