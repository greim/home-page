import { assertEquals, assertThrows } from "@std/assert";
import { Duration, Effect, Either, Fiber, TestClock, TestContext } from "effect";
import { makeMailbox, planDelivery } from "./mailbox.ts";

/** Runs an effect on the test clock: time only passes with TestClock.adjust. */
const runTest = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestContext.TestContext)));

const failureTag = <A>(result: Either.Either<A, { _tag: string }>) =>
  Either.isLeft(result) ? result.left._tag : "succeeded";

const node = (): Node => ({}) as Node;

const echo = (message: unknown) => message;

Deno.test("planDelivery", async (t) => {
  await t.step("a closed channel is closed, even with a handler", () => {
    assertEquals(planDelivery(echo, true, 5000).is, "closed");
  });
  await t.step("a handler handles", () => {
    assertEquals(planDelivery(echo, false, 0), { is: "handle", handler: echo });
  });
  await t.step("no handler and no timeout fails at once", () => {
    assertEquals(planDelivery(null, false, 0).is, "no-handler");
  });
  await t.step("no handler waits for the timeout", () => {
    assertEquals(planDelivery(null, false, 5000), {
      is: "wait",
      timeout: Duration.millis(5000),
    });
  });
  await t.step("an infinite timeout waits forever", () => {
    assertEquals(planDelivery(null, false, Infinity), { is: "wait", timeout: null });
  });
});

Deno.test("a message to a channel with a handler gets its reply", async () => {
  const mailbox = makeMailbox();
  mailbox.receive("c", (m) => `got ${m}`);
  assertEquals(
    await runTest(mailbox.deliver("c", "hi", { deliveryTimeout: 0 })),
    "got hi",
  );
});

Deno.test("an async handler's reply is awaited", async () => {
  const mailbox = makeMailbox();
  mailbox.receive("c", (m) => Promise.resolve(`got ${m}`));
  assertEquals(await runTest(mailbox.deliver("c", "hi", { deliveryTimeout: 0 })), "got hi");
});

Deno.test("a handler that throws or rejects fails the message", async () => {
  const mailbox = makeMailbox();
  mailbox.receive("throws", () => {
    throw new Error("boom");
  });
  mailbox.receive("rejects", () => Promise.reject(new Error("boom")));
  for (const channel of ["throws", "rejects"]) {
    const result = await runTest(
      Effect.either(mailbox.deliver(channel, null, { deliveryTimeout: 0 })),
    );
    assertEquals(failureTag(result), "HandlerFailed");
  }
});

Deno.test("deliveryTimeout 0 fails at once when there's no handler", async () => {
  const mailbox = makeMailbox();
  const result = await runTest(
    Effect.either(mailbox.deliver("c", null, { deliveryTimeout: 0 })),
  );
  assertEquals(failureTag(result), "NoHandler");
});

Deno.test("a message waits for a handler, and is delivered when one registers", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fiber = yield* Effect.fork(mailbox.deliver("c", "hi", { deliveryTimeout: 5000 }));
    yield* TestClock.adjust("4 seconds");
    mailbox.receive("c", (m) => `got ${m}`);
    assertEquals(yield* Fiber.join(fiber), "got hi");
  })));

Deno.test("waiting messages are delivered in the order sent", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fibers = yield* Effect.forEach(
      ["a", "b", "c"],
      (m) => Effect.fork(mailbox.deliver("c", m, { deliveryTimeout: 5000 })),
    );
    yield* Effect.yieldNow();
    const seen: Array<unknown> = [];
    mailbox.receive("c", (m) => seen.push(m));
    yield* Effect.forEach(fibers, Fiber.join);
    assertEquals(seen, ["a", "b", "c"]);
  })));

Deno.test("a waiting message fails with no-handler when its timeout passes", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fiber = yield* Effect.fork(
      Effect.either(mailbox.deliver("c", "hi", { deliveryTimeout: 5000 })),
    );
    yield* TestClock.adjust("5 seconds");
    assertEquals(failureTag(yield* Fiber.join(fiber)), "NoHandler");
    // It's no longer queued: a handler registered now doesn't see it.
    const seen: Array<unknown> = [];
    mailbox.receive("c", (m) => seen.push(m));
    yield* Effect.yieldNow();
    assertEquals(seen, []);
  })));

Deno.test("the timeout stops once a handler takes the message", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fiber = yield* Effect.fork(mailbox.deliver("c", "hi", { deliveryTimeout: 5000 }));
    yield* Effect.yieldNow();
    let finish: (reply: string) => void = () => {};
    mailbox.receive("c", () => new Promise<string>((resolve) => finish = resolve));
    yield* TestClock.adjust("1 minute");
    finish("done");
    assertEquals(yield* Fiber.join(fiber), "done");
  })));

Deno.test("an infinite timeout keeps waiting", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fiber = yield* Effect.fork(mailbox.deliver("c", "hi", { deliveryTimeout: Infinity }));
    yield* TestClock.adjust("1 day");
    mailbox.receive("c", echo);
    assertEquals(yield* Fiber.join(fiber), "hi");
  })));

Deno.test("an interrupted message leaves the queue", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const fiber = yield* Effect.fork(mailbox.deliver("c", "hi", { deliveryTimeout: 5000 }));
    yield* Effect.yieldNow();
    yield* Fiber.interrupt(fiber);
    const seen: Array<unknown> = [];
    mailbox.receive("c", (m) => seen.push(m));
    yield* Effect.yieldNow();
    assertEquals(seen, []);
  })));

Deno.test("a second handler on a channel throws", () => {
  const mailbox = makeMailbox();
  mailbox.receive("c", echo);
  assertThrows(() => mailbox.receive("c", echo), Error, "already has a handler");
});

Deno.test("unsubscribing removes the handler, so the channel can take another", async () => {
  const mailbox = makeMailbox();
  const unsubscribe = mailbox.receive("c", () => "first");
  unsubscribe();
  const result = await runTest(Effect.either(mailbox.deliver("c", null, { deliveryTimeout: 0 })));
  assertEquals(failureTag(result), "NoHandler");
  mailbox.receive("c", () => "second");
  assertEquals(await runTest(mailbox.deliver("c", null, { deliveryTimeout: 0 })), "second");
});

Deno.test("a stale unsubscribe doesn't remove a newer handler", async () => {
  const mailbox = makeMailbox();
  const unsubscribe = mailbox.receive("c", () => "first");
  unsubscribe();
  mailbox.receive("c", () => "second");
  unsubscribe();
  assertEquals(await runTest(mailbox.deliver("c", null, { deliveryTimeout: 0 })), "second");
});

Deno.test("closing a mount-node channel fails what's queued and anything sent later", () =>
  runTest(Effect.gen(function* () {
    const mailbox = makeMailbox();
    const key = node();
    const fiber = yield* Effect.fork(
      Effect.either(mailbox.deliver(key, "hi", { deliveryTimeout: Infinity })),
    );
    yield* Effect.yieldNow();
    mailbox.close(key);
    assertEquals(failureTag(yield* Fiber.join(fiber)), "ChannelClosed");
    const later = yield* Effect.either(mailbox.deliver(key, "hi", { deliveryTimeout: 5000 }));
    assertEquals(failureTag(later), "ChannelClosed");
    assertThrows(() => mailbox.receive(key, echo), Error, "it has closed");
  })));

Deno.test("closing a channel with a handler stops it handling", async () => {
  const mailbox = makeMailbox();
  const key = node();
  mailbox.receive(key, echo);
  mailbox.close(key);
  const result = await runTest(Effect.either(mailbox.deliver(key, null, { deliveryTimeout: 0 })));
  assertEquals(failureTag(result), "ChannelClosed");
});

Deno.test("string channels never close", async () => {
  const mailbox = makeMailbox();
  mailbox.receive("c", echo);
  mailbox.close("c");
  assertEquals(await runTest(mailbox.deliver("c", "hi", { deliveryTimeout: 0 })), "hi");
});

Deno.test("channels are independent", async () => {
  const mailbox = makeMailbox();
  const [a, b] = [node(), node()];
  mailbox.receive(a, () => "a");
  mailbox.receive(b, () => "b");
  mailbox.close(a);
  assertEquals(await runTest(mailbox.deliver(b, null, { deliveryTimeout: 0 })), "b");
});
