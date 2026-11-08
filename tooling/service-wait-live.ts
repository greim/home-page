/** Imperative shell for waiting on services: real sockets, timers and the console. */
import { Effect } from "effect";
import { WaitIo } from "./service-wait.ts";

/** Whether something on this machine is accepting connections on `port`. */
export const listening = (port: number): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.connect({ hostname: "127.0.0.1", port })).pipe(
    Effect.map((conn) => conn.close()),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

export const liveWaitIo = WaitIo.of({
  listening,
  sleep: (ms) => Effect.sleep(ms),
  log: (line) => Effect.sync(() => console.log(line)),
});
