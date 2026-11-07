/**
 * Waits for restarted services to take connections again, so `restart-service`
 * returns once the page can be reloaded (the main server bundles the page and
 * builds the widgets before it listens, which takes a while).
 */
import { Context, Effect } from "effect";

export class WaitIo extends Context.Tag("WaitIo")<
  WaitIo,
  {
    /** Whether something on this machine is accepting connections on `port`. */
    readonly listening: (port: number) => Effect.Effect<boolean>;
    readonly sleep: (ms: number) => Effect.Effect<void>;
    readonly log: (line: string) => Effect.Effect<void>;
  }
>() {}

export type Service = { readonly name: string; readonly port: number; readonly log: string };

/** How often to check, and for how long, before giving up. */
export type Patience = { readonly pollMs: number; readonly timeoutMs: number };

export const defaultPatience: Patience = { pollMs: 500, timeoutMs: 120_000 };

/**
 * Waits for each service in turn, saying how long it took, or that it didn't come
 * back (and where to look). True if all are back.
 */
export const awaitServices = (
  services: ReadonlyArray<Service>,
  patience: Patience = defaultPatience,
): Effect.Effect<boolean, never, WaitIo> =>
  Effect.gen(function* () {
    const io = yield* WaitIo;
    const attempts = Math.ceil(patience.timeoutMs / patience.pollMs);
    let waited = 0;
    let allBack = true;
    for (const service of services) {
      yield* io.log(`Waiting for the ${service.name} (port ${service.port})…`);
      let back = false;
      for (let i = 0; i < attempts && !back; i++) {
        back = yield* io.listening(service.port);
        if (!back) {
          yield* io.sleep(patience.pollMs);
          waited += patience.pollMs;
        }
      }
      allBack &&= back;
      yield* io.log(
        back
          ? `  ✓ ready (${Math.round(waited / 1000)}s)`
          : `  ✗ not back after ${patience.timeoutMs / 1000}s: see ${service.log}`,
      );
    }
    return allBack;
  });
