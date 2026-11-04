import { assertEquals, assertStringIncludes } from "@std/assert";
import { Deferred, Effect, Fiber, TestClock, TestContext } from "effect";
import { runToResult, type SendResult } from "./errors.ts";
import { makeMailbox } from "./mailbox.ts";
import { makeManager, type ManagerCore, ManagerIo, PipeError } from "./manager.ts";
import type { DeliverOptions, MfePort, Registrar, ShellPort } from "./protocol.ts";

/** A bundle, as the fake import runs it: given the registrar, it may register. */
type FakeBundle = (registrar: Registrar) => void;

type Fakes = {
  readonly bundles?: ReadonlyMap<string, FakeBundle>;
  readonly status?: number;
  readonly resolve?: (mfe: string) => Effect.Effect<string, PipeError>;
  readonly importModule?: (url: string) => Effect.Effect<void, PipeError>;
};

const makeTestManager = (fakes: Fakes = {}) => {
  const imports: Array<string> = [];
  let registrar: Registrar | null = null;
  const io = ManagerIo.of({
    resolve: fakes.resolve ?? ((mfe) => Effect.succeed(`/${mfe}.js`)),
    importModule: fakes.importModule ?? ((url) =>
      Effect.suspend(() => {
        imports.push(url);
        const bundle = fakes.bundles?.get(url);
        if (bundle === undefined || registrar === null) {
          return Effect.fail(new PipeError({ cause: new TypeError("Failed to fetch") }));
        }
        return Effect.try({
          try: () => bundle(registrar as Registrar),
          catch: (cause) => new PipeError({ cause }),
        });
      })),
    probe: (url) => Effect.succeed(fakes.bundles?.has(url) ? 200 : fakes.status ?? 404),
    installRegistrar: (r) => Effect.sync(() => registrar = r),
  });
  const core = Effect.runSync(makeManager.pipe(Effect.provideService(ManagerIo, io)));
  return { core, imports };
};

const options = (overrides: Partial<DeliverOptions> = {}): DeliverOptions => ({
  deliveryTimeout: 0,
  signal: null,
  ...overrides,
});

const send = (core: ManagerCore, mfe: string, channel: string, message: unknown) =>
  runToResult(core.send(mfe, channel, message, options()));

/** An MFE side with its own mailbox, as registerMfe would set up. */
const fakeMfe = (setup: (receive: ReturnType<typeof makeMailbox>["receive"]) => void) => {
  const shell: { port: ShellPort | null } = { port: null };
  const bundle: FakeBundle = (registrar) => {
    const mailbox = makeMailbox();
    const port: MfePort = {
      deliver: (channel, message, o) => runToResult(mailbox.deliver(channel, message, o)),
    };
    setup(mailbox.receive);
    shell.port = registrar.register("echo", port);
  };
  return { bundle, shell };
};

const errorOf = (result: SendResult) => result.ok ? null : result.error;

Deno.test("sending to an MFE loads it, then delivers the message", async () => {
  const mfe = fakeMfe((receive) => receive("greet", (m) => `hello ${m}`));
  const { core, imports } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
  assertEquals(await send(core, "echo", "greet", "you"), { ok: true, value: "hello you" });
  assertEquals(await send(core, "echo", "greet", "again"), { ok: true, value: "hello again" });
  assertEquals(imports, ["/echo.js"]);
});

Deno.test("messages sent while an MFE loads share one load", async () => {
  const mfe = fakeMfe((receive) => receive("greet", (m) => m));
  const { core, imports } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
  const replies = await Promise.all([
    send(core, "echo", "greet", 1),
    send(core, "echo", "greet", 2),
  ]);
  assertEquals(replies, [{ ok: true, value: 1 }, { ok: true, value: 2 }]);
  assertEquals(imports, ["/echo.js"]);
});

Deno.test("an MFE's failure on its side reaches the sender as it was", async () => {
  const mfe = fakeMfe(() => {});
  const { core } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
  assertEquals(errorOf(await send(core, "echo", "nobody", null))?.is, "no-handler");
});

Deno.test("an MFE can send the shell messages", async () => {
  const mfe = fakeMfe(() => {});
  const { core } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
  core.receive("echo", "save", (m) => `saved ${m}`);
  await send(core, "echo", "anything", null);
  const reply = await mfe.shell.port?.deliver("save", "x", options());
  assertEquals(reply, { ok: true, value: "saved x" });
});

Deno.test("a bundle that 404s is not-found, and stays failed", async () => {
  const { core, imports } = makeTestManager();
  const error = errorOf(await send(core, "nope", "c", null));
  assertEquals(error?.is, "not-found");
  assertStringIncludes(error?.message ?? "", "/nope.js");
  assertEquals(errorOf(await send(core, "nope", "c", null))?.is, "not-found");
  assertEquals(imports, ["/nope.js"]);
});

Deno.test("a bundle that fails otherwise is a network failure", async () => {
  const { core } = makeTestManager({ status: 500 });
  const error = errorOf(await send(core, "broken", "c", null));
  assertEquals(error?.is, "network");
  assertStringIncludes(error?.message ?? "", "Failed to fetch");
});

Deno.test("a failed probe is a network failure", async () => {
  const io = ManagerIo.of({
    resolve: (mfe) => Effect.succeed(`/${mfe}.js`),
    importModule: () => Effect.fail(new PipeError({ cause: "offline" })),
    probe: () => Effect.fail(new PipeError({ cause: "offline" })),
    installRegistrar: () => Effect.void,
  });
  const offline = Effect.runSync(makeManager.pipe(Effect.provideService(ManagerIo, io)));
  assertEquals(errorOf(await send(offline, "x", "c", null))?.is, "network");
});

Deno.test("a resolver failure is a resolver failure", async () => {
  const { core } = makeTestManager({
    resolve: () => Effect.fail(new PipeError({ cause: new Error("no such widget") })),
  });
  const error = errorOf(await send(core, "x", "c", null));
  assertEquals(error?.is, "resolver");
  assertStringIncludes(error?.message ?? "", "no such widget");
});

Deno.test("a bundle that doesn't register is a registration failure", async () => {
  const { core } = makeTestManager({ bundles: new Map([["/quiet.js", () => {}]]) });
  const error = errorOf(await send(core, "quiet", "c", null));
  assertEquals(error?.is, "registration");
  assertStringIncludes(error?.message ?? "", `didn't call registerMfe("quiet")`);
});

Deno.test("a bundle that registers under another ID says which", async () => {
  const mfe = fakeMfe(() => {});
  const { core } = makeTestManager({ bundles: new Map([["/other.js", mfe.bundle]]) });
  const error = errorOf(await send(core, "other", "c", null));
  assertEquals(error?.is, "registration");
  assertStringIncludes(error?.message ?? "", `it registered as "echo"`);
});

Deno.test("a bundle that registers twice is a registration failure", async () => {
  const twice: FakeBundle = (registrar) => {
    const port: MfePort = { deliver: () => Promise.resolve({ ok: true, value: null }) };
    registrar.register("twice", port);
    registrar.register("twice", port);
  };
  const { core } = makeTestManager({ bundles: new Map([["/twice.js", twice]]) });
  const error = errorOf(await send(core, "twice", "c", null));
  assertEquals(error?.is, "registration");
  assertStringIncludes(error?.message ?? "", "more than once");
});

Deno.test("a bundle that registers, then throws, is a network failure", async () => {
  const mfe = fakeMfe(() => {});
  const throwing: FakeBundle = (registrar) => {
    mfe.bundle(registrar);
    throw new Error("crashed after registering");
  };
  const { core } = makeTestManager({ bundles: new Map([["/echo.js", throwing]]) });
  const error = errorOf(await send(core, "echo", "c", null));
  assertEquals(error?.is, "network");
  assertStringIncludes(error?.message ?? "", "crashed after registering");
});

Deno.test("aborting gives up on the load without failing it for others", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      const mfe = fakeMfe((receive) => receive("c", (m) => m));
      let registrar: Registrar | null = null;
      const io = ManagerIo.of({
        resolve: (id) => Effect.succeed(`/${id}.js`),
        importModule: () =>
          Deferred.await(gate).pipe(Effect.andThen(() => mfe.bundle(registrar as Registrar))),
        probe: () => Effect.succeed(200),
        installRegistrar: (r) => Effect.sync(() => registrar = r),
      });
      const core = yield* makeManager.pipe(Effect.provideService(ManagerIo, io));
      const controller = new AbortController();
      const first = yield* Effect.fork(
        Effect.promise(() =>
          runToResult(core.send("echo", "c", 1, options({ signal: controller.signal })))
        ),
      );
      const second = yield* Effect.fork(
        Effect.promise(() => runToResult(core.send("echo", "c", 2, options()))),
      );
      yield* Effect.sleep(0);
      controller.abort("not needed");
      assertEquals(errorOf(yield* Fiber.join(first))?.is, "aborted");
      yield* Deferred.succeed(gate, undefined);
      assertEquals(yield* Fiber.join(second), { ok: true, value: 2 });
    }),
  ));

Deno.test("an already-aborted signal fails at once", async () => {
  const { core, imports } = makeTestManager();
  const result = await runToResult(
    core.send("echo", "c", null, options({ signal: AbortSignal.abort("no") })),
  );
  assertEquals(errorOf(result)?.is, "aborted");
  assertEquals(imports, []);
});

Deno.test("messages from an MFE wait for the shell's handler", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const mfe = fakeMfe(() => {});
      const { core } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
      yield* Effect.promise(() => send(core, "echo", "load", null));
      const reply = yield* Effect.fork(
        Effect.promise(() =>
          mfe.shell.port?.deliver("late", "x", options({ deliveryTimeout: 5000 })) ??
            Promise.reject()
        ),
      );
      yield* TestClock.adjust("1 second");
      core.receive("echo", "late", (m) => `late ${m}`);
      assertEquals(yield* Fiber.join(reply), { ok: true, value: "late x" });
    }).pipe(Effect.provide(TestContext.TestContext)),
  ));

Deno.test("closing the shell's side of a channel fails messages from the MFE", async () => {
  const mfe = fakeMfe(() => {});
  const { core } = makeTestManager({ bundles: new Map([["/echo.js", mfe.bundle]]) });
  await send(core, "echo", "load", null);
  const node = {} as Node;
  core.receive("echo", node, () => "never");
  core.close("echo", node);
  const reply = await mfe.shell.port?.deliver(node, "x", options());
  assertEquals(reply === undefined ? null : errorOf(reply)?.is, "channel-closed");
});

Deno.test("a registration while nothing is loading throws", () => {
  let registrar: Registrar | null = null;
  const io = ManagerIo.of({
    resolve: () => Effect.die("unused"),
    importModule: () => Effect.die("unused"),
    probe: () => Effect.die("unused"),
    installRegistrar: (r) => Effect.sync(() => registrar = r),
  });
  Effect.runSync(makeManager.pipe(Effect.provideService(ManagerIo, io)));
  let threw = false;
  try {
    (registrar as Registrar | null)?.register("x", {
      deliver: () => Promise.resolve({ ok: true, value: null }),
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
