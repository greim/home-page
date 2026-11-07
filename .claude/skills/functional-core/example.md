# Worked example: a cached store

## I/O interface

```ts
import { Context, Data, Effect } from "effect";

class IoError extends Data.TaggedError("IoError")<{ cause: unknown }> {}

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

Note that the cache and the store are separate pipes. The fallback from one to the other is a
decision, so it lives in the core.

## Functional core (thick)

```ts
import { Data, Effect } from "effect";

class ReadError extends Data.TaggedError("ReadError")<{ cause: unknown }> {}
class WriteError extends Data.TaggedError("WriteError")<{ cause: unknown }> {}

export const read = (id: string): Effect.Effect<Item, ReadError, Io> =>
  Effect.gen(function* () {
    const io = yield* Io;
    const cached = yield* io.readCache(id);
    if (cached !== undefined) {
      return JSON.parse(cached) as Item;
    }
    const json = yield* io.readStore(id);
    yield* io.writeCache(id, json);
    return JSON.parse(json) as Item;
  }).pipe(Effect.mapError((cause) => new ReadError({ cause })));

export const write = (id: string, item: Item): Effect.Effect<void, WriteError, Io> =>
  Effect.gen(function* () {
    const io = yield* Io;
    const json = JSON.stringify(item);
    yield* io.writeCache(id, json);
    yield* io.writeStore(id, json);
  }).pipe(Effect.mapError((cause) => new WriteError({ cause })));
```

(In real code, decode JSON with Effect Schema rather than casting.)

## Imperative shell (thin)

```ts
import { Effect, Layer } from "effect";

const readFile = (path: string) =>
  Effect.tryPromise({
    try: () => Deno.readTextFile(path),
    catch: (cause) => new IoError({ cause }),
  });

const writeFile = (path: string, data: string) =>
  Effect.tryPromise({
    try: () => Deno.writeTextFile(path, data),
    catch: (cause) => new IoError({ cause }),
  });

const ioLive = (root: string, cache: Map<string, string>) =>
  Layer.succeed(Io, {
    readStore: (id) => readFile(`${root}/${id}.json`),
    readCache: (id) => Effect.sync(() => cache.get(id)),
    writeStore: (id, json) => writeFile(`${root}/${id}.json`, json),
    writeCache: (id, json) => Effect.sync(() => void cache.set(id, json)),
  });

export const handler = (root: string, cache: Map<string, string>, id: string) =>
  Effect.runPromise(read(id).pipe(Effect.provide(ioLive(root, cache))));
```

No branches: every line plugs a real implementation into a slot.

## Core tests (no monkey-patching)

```ts
import { assertEquals } from "@std/assert";
import { Effect } from "effect";

Deno.test("read() returns the cached value without touching the store", async () => {
  const item = await read("1").pipe(
    Effect.provideService(Io, {
      readCache: () => Effect.succeed(JSON.stringify({ name: "Widget" })),
      readStore: () => Effect.die("should not be called"),
      writeCache: () => Effect.die("should not be called"),
      writeStore: () => Effect.die("should not be called"),
    }),
    Effect.runPromise,
  );
  assertEquals(item, { name: "Widget" });
});

Deno.test("read() falls back to the store on a cache miss, then backfills the cache", async () => {
  let cached: string | undefined;
  const item = await read("1").pipe(
    Effect.provideService(Io, {
      readCache: () => Effect.succeed(undefined),
      readStore: () => Effect.succeed(JSON.stringify({ name: "Widget" })),
      writeCache: (_id, json) => Effect.sync(() => void (cached = json)),
      writeStore: () => Effect.die("should not be called"),
    }),
    Effect.runPromise,
  );
  assertEquals(item, { name: "Widget" });
  assertEquals(cached, JSON.stringify({ name: "Widget" }));
});
```

The shell's single integration test would run `handler` against a temporary directory and check that
the file it reads and writes is `${root}/${id}.json` (wiring), and that a missing file fails the way
the core's fakes assume (contract).
