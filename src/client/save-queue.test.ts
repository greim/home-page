import { assertEquals } from "@std/assert";
import { Deferred, Effect } from "effect";
import { makeSaveQueue } from "./save-queue.ts";

Deno.test("saves are sent in order and bursts coalesce to the latest", async () => {
  const sent: Array<number> = [];
  const results: Array<unknown> = [];
  const gate = Effect.runSync(Deferred.make<void>());
  const queue = makeSaveQueue(
    (n: number) =>
      Effect.gen(function* () {
        sent.push(n);
        if (n === 1) yield* Deferred.await(gate);
      }),
    (r) => results.push(r),
  );
  queue.save(1); // in flight, blocked on the gate
  queue.save(2); // superseded
  queue.save(3); // pending
  await Effect.runPromise(Effect.yieldNow());
  assertEquals(sent, [1]);
  await Effect.runPromise(Deferred.succeed(gate, undefined));
  await Effect.runPromise(Effect.sleep(1));
  assertEquals(sent, [1, 3]);
  assertEquals(results, [{ ok: true }, { ok: true }]);
});

Deno.test("failures are reported and don't stall the queue", async () => {
  const results: Array<unknown> = [];
  const queue = makeSaveQueue(
    (n: number) => (n === 1 ? Effect.fail("nope") : Effect.void),
    (r) => results.push(r),
  );
  queue.save(1);
  await Effect.runPromise(Effect.sleep(1));
  queue.save(2);
  await Effect.runPromise(Effect.sleep(1));
  assertEquals(results, [{ ok: false, error: "nope" }, { ok: true }]);
});
