import { assertEquals } from "@std/assert";
import { Chunk, Effect, Fiber, Stream } from "effect";
import type { ChatEvent } from "../common/assistant.ts";
import { makeEventLog } from "./event-log.ts";

const text = (t: string): ChatEvent => ({ is: "text", text: t });

Deno.test("events are numbered in order, from 1", async () => {
  const seqs = await Effect.runPromise(Effect.gen(function* () {
    const log = yield* makeEventLog("a", 10);
    assertEquals(yield* log.latest, 0);
    return [
      yield* log.publish(text("one"), null),
      yield* log.publish(text("two"), null),
      yield* log.latest,
    ];
  }));
  assertEquals(seqs, [1, 2, 2]);
});

Deno.test("a reader gets what it missed after its point, then what comes next", async () => {
  const read = await Effect.runPromise(Effect.gen(function* () {
    const log = yield* makeEventLog("a", 10);
    yield* log.publish(text("one"), null);
    yield* log.publish(text("two"), null);
    const reader = yield* log.after(1).pipe(Stream.take(2), Stream.runCollect, Effect.fork);
    // Let the reader subscribe before the next event, as a live client would.
    yield* Effect.yieldNow();
    yield* log.publish(text("three"), null);
    return Chunk.toReadonlyArray(yield* Fiber.join(reader));
  }));
  assertEquals(read, [
    { seq: 2, event: text("two"), transient: false, sessionId: null },
    { seq: 3, event: text("three"), transient: false, sessionId: null },
  ]);
});

Deno.test("only the most recent events are kept for readers that come later", async () => {
  const read = await Effect.runPromise(Effect.gen(function* () {
    const log = yield* makeEventLog("a", 2);
    for (const t of ["one", "two", "three"]) yield* log.publish(text(t), null);
    return Chunk.toReadonlyArray(yield* log.after(0).pipe(Stream.take(2), Stream.runCollect));
  }));
  assertEquals(read.map((e) => e.seq), [2, 3]);
});

Deno.test("each log says which it is", async () => {
  assertEquals(await Effect.runPromise(Effect.map(makeEventLog("run-7", 1), (l) => l.id)), "run-7");
});

Deno.test("transient events reach current readers but aren't kept or numbered", async () => {
  const [live, later] = await Effect.runPromise(Effect.gen(function* () {
    const log = yield* makeEventLog("a", 10);
    yield* log.publish(text("one"), null);
    const reader = yield* log.after(1).pipe(Stream.take(2), Stream.runCollect, Effect.fork);
    // Transient events reach only readers already listening.
    yield* Effect.sleep("10 millis");
    yield* log.publishTransient({ is: "delta", text: "par" }, "s1");
    yield* log.publish(text("two"), null);
    const live = Chunk.toReadonlyArray(yield* Fiber.join(reader));
    const later = Chunk.toReadonlyArray(
      yield* log.after(0).pipe(Stream.take(2), Stream.runCollect),
    );
    return [live, later];
  }));
  assertEquals(live, [
    { seq: 1, event: { is: "delta", text: "par" }, transient: true, sessionId: "s1" },
    { seq: 2, event: text("two"), transient: false, sessionId: null },
  ]);
  assertEquals(later.map((e) => e.seq), [1, 2]);
});
