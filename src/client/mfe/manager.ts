/**
 * Functional core of the shell's half of the framework: loading MFEs on
 * demand, taking their registrations, and routing messages both ways. All I/O
 * goes through the injected {@link ManagerIo} pipes.
 */
import { Context, Data, Deferred, Effect, Either } from "effect";
import {
  type LoadError,
  type MfeError,
  NetworkFailed,
  NotFound,
  RegistrationFailed,
  Reported,
  ResolverFailed,
  runToResult,
  withAbort,
} from "./errors.ts";
import { type Mailbox, makeMailbox } from "./mailbox.ts";
import type {
  ChannelKey,
  DeliverOptions,
  Handler,
  MfePort,
  Registrar,
  ShellPort,
} from "./protocol.ts";

export class PipeError extends Data.TaggedError("PipeError")<{ cause: unknown }> {}

export class ManagerIo extends Context.Tag("ManagerIo")<
  ManagerIo,
  {
    /** The shell's resolver: an MFE's ID to its bundle's URL. */
    readonly resolve: (mfe: string) => Effect.Effect<string, PipeError>;
    /** Imports and runs a bundle. */
    readonly importModule: (url: string) => Effect.Effect<void, PipeError>;
    /** The HTTP status of a URL. Used to explain a failed import. */
    readonly probe: (url: string) => Effect.Effect<number, PipeError>;
    /** Puts the registrar where bundles look for it. */
    readonly installRegistrar: (registrar: Registrar) => Effect.Effect<void>;
  }
>() {}

type LoadState =
  | { readonly is: "loading"; readonly done: Deferred.Deferred<MfePort, LoadError> }
  | { readonly is: "loaded"; readonly port: MfePort }
  | { readonly is: "failed"; readonly error: LoadError };

type Registration =
  | { readonly is: "registered"; readonly port: MfePort }
  | { readonly is: "invalid"; readonly reason: string };

export type ManagerCore = {
  readonly send: (
    mfe: string,
    channel: ChannelKey,
    message: unknown,
    options: DeliverOptions,
  ) => Effect.Effect<unknown, MfeError>;
  readonly receive: (mfe: string, channel: ChannelKey, handler: Handler) => () => void;
  /** Closes the shell's side of a mount-node channel. */
  readonly close: (mfe: string, channel: ChannelKey) => void;
};

export const makeManager: Effect.Effect<ManagerCore, never, ManagerIo> = Effect.gen(
  function* () {
    const io = yield* ManagerIo;
    const loads = new Map<string, LoadState>();
    const registrations = new Map<string, Registration>();
    /** IDs that registered while nothing was loading them. */
    const strays: Array<string> = [];
    const mailboxes = new Map<string, Mailbox>();

    const mailboxOf = (mfe: string): Mailbox => {
      const existing = mailboxes.get(mfe);
      if (existing !== undefined) {
        return existing;
      }
      const created = makeMailbox();
      mailboxes.set(mfe, created);
      return created;
    };

    const shellPort = (mfe: string): ShellPort => ({
      deliver: (channel, message, options) =>
        runToResult(
          withAbort(mailboxOf(mfe).deliver(channel, message, options), options.signal),
        ),
    });

    const registrar: Registrar = {
      register: (mfe, port) => {
        if (loads.get(mfe)?.is !== "loading") {
          strays.push(mfe);
          throw new Error(`Nothing is loading an MFE called "${mfe}"`);
        }
        if (registrations.has(mfe)) {
          const reason = `"${mfe}" called registerMfe more than once`;
          registrations.set(mfe, { is: "invalid", reason });
          throw new Error(reason);
        }
        registrations.set(mfe, { is: "registered", port });
        return shellPort(mfe);
      },
    };
    yield* io.installRegistrar(registrar);

    /** Why an import failed: a 404, or anything else. */
    const explainImportFailure = (mfe: string, url: string, cause: unknown) =>
      io.probe(url).pipe(
        Effect.either,
        Effect.flatMap((status): Effect.Effect<never, LoadError> =>
          Either.isRight(status) && status.right === 404
            ? Effect.fail(new NotFound({ mfe, url }))
            : Effect.fail(new NetworkFailed({ mfe, url, cause }))
        ),
      );

    /** The port `mfe` registered, given the IDs that registered stray while it loaded. */
    const registered = (
      mfe: string,
      strayIds: ReadonlyArray<string>,
    ): Effect.Effect<MfePort, RegistrationFailed> => {
      const registration = registrations.get(mfe);
      if (registration === undefined) {
        const others = strayIds.length === 0
          ? ""
          : ` (it registered as "${strayIds.join('", "')}")`;
        return Effect.fail(
          new RegistrationFailed({
            mfe,
            reason: `"${mfe}" didn't call registerMfe("${mfe}")${others}`,
          }),
        );
      }
      return registration.is === "registered"
        ? Effect.succeed(registration.port)
        : Effect.fail(new RegistrationFailed({ mfe, reason: registration.reason }));
    };

    const load = (mfe: string): Effect.Effect<MfePort, LoadError> =>
      Effect.gen(function* () {
        const url = yield* io.resolve(mfe).pipe(
          Effect.mapError((e) => new ResolverFailed({ mfe, cause: e.cause })),
        );
        const straysBefore = strays.length;
        const imported = yield* Effect.either(io.importModule(url));
        const strayIds = strays.slice(straysBefore);
        const registration = registrations.get(mfe);
        // A bad registration explains a failed import better than the import's own error.
        const badRegistration = registration?.is === "invalid" ||
          (registration === undefined && strayIds.length > 0);
        if (Either.isLeft(imported) && !badRegistration) {
          return yield* explainImportFailure(mfe, url, imported.left.cause);
        }
        return yield* registered(mfe, strayIds);
      });

    /** Loads an MFE once; later callers share the outcome, even if the first gives up. */
    const loaded = (mfe: string): Effect.Effect<MfePort, LoadError> =>
      Effect.suspend(() => {
        const state = loads.get(mfe);
        if (state !== undefined) {
          switch (state.is) {
            case "loaded":
              return Effect.succeed(state.port);
            case "failed":
              return Effect.fail(state.error);
            case "loading":
              return Deferred.await(state.done);
            default:
              return state satisfies never;
          }
        }
        return Effect.gen(function* () {
          const done = yield* Deferred.make<MfePort, LoadError>();
          loads.set(mfe, { is: "loading", done });
          yield* Effect.forkDaemon(
            load(mfe).pipe(
              Effect.tap((port) => Effect.sync(() => loads.set(mfe, { is: "loaded", port }))),
              Effect.tapError((error) =>
                Effect.sync(() => loads.set(mfe, { is: "failed", error }))
              ),
              Effect.exit,
              Effect.flatMap((exit) => Deferred.done(done, exit)),
            ),
          );
          return yield* Deferred.await(done);
        });
      });

    return {
      send: (mfe, channel, message, options) =>
        withAbort(
          Effect.gen(function* () {
            const port = yield* loaded(mfe);
            const result = yield* Effect.promise(() => port.deliver(channel, message, options));
            return yield* result.ok
              ? Effect.succeed(result.value)
              : Effect.fail(new Reported({ error: result.error }));
          }),
          options.signal,
        ),
      receive: (mfe, channel, handler) => mailboxOf(mfe).receive(channel, handler),
      close: (mfe, channel) => mailboxOf(mfe).close(channel),
    };
  },
);
