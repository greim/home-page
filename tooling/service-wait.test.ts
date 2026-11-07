import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { awaitServices, WaitIo } from "./service-wait.ts";

const app = { name: "server", port: 8443, log: "logs/server.log" };
const assistant = { name: "assistant service", port: 9443, log: "logs/assistant.log" };

/** Fake pipes: each port answers per its list of checks, then stays as its last answer. */
const run = (answers: Readonly<Record<number, ReadonlyArray<boolean>>>, timeoutMs = 2000) => {
  const lines: Array<string> = [];
  const asked: Array<number> = [];
  const left = Object.fromEntries(Object.entries(answers).map(([p, a]) => [p, [...a]]));
  const io = WaitIo.of({
    listening: (port) =>
      Effect.sync(() => {
        asked.push(port);
        const queue = left[port] ?? [];
        return queue.length > 1 ? queue.shift()! : queue.at(0) ?? false;
      }),
    sleep: () => Effect.void,
    log: (line) => Effect.sync(() => void lines.push(line)),
  });
  const ok = Effect.runSync(
    awaitServices([app, assistant], { pollMs: 500, timeoutMs }).pipe(
      Effect.provideService(WaitIo, io),
    ),
  );
  return { ok, lines, asked };
};

Deno.test("each service is waited for until it takes connections, saying how long it took", () => {
  const { ok, lines } = run({ 8443: [false, false, false, false, true], 9443: [true] }, 5000);
  assertEquals(ok, true);
  assertEquals(lines, [
    "Waiting for the server (port 8443)…",
    "  ✓ ready (2s)",
    "Waiting for the assistant service (port 9443)…",
    "  ✓ ready (2s)",
  ]);
});

Deno.test("a service that doesn't come back fails the wait, saying where to look", () => {
  const { ok, lines, asked } = run({ 8443: [false], 9443: [true] }, 1000);
  assertEquals(ok, false);
  assertEquals(lines.at(1), "  ✗ not back after 1s: see logs/server.log");
  // It gave up after the timeout's worth of checks, then still checked the next one.
  assertEquals(asked, [8443, 8443, 9443]);
});
