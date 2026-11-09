import { assertEquals } from "@std/assert";
import { Schema } from "effect";
import type { RunEvent } from "../../common/agent-runs.ts";
import { nextView, runsBase, type RunView, splitLines } from "./agent-run.ts";

const Output = Schema.Struct({ n: Schema.Number });
type Output = typeof Output.Type;

const running: RunView<Output> = { is: "running", runId: "r1", progress: [], ask: null };

const apply = (events: ReadonlyArray<RunEvent>, from: RunView<Output> = running) =>
  events.reduce((view, event, i) => nextView(view, { seq: i + 1, event }, Output), from);

Deno.test("a run's progress builds up, and its asks come and go", () => {
  const ask = {
    is: "ask",
    askId: "a1",
    capability: "Reads pages",
    action: "Read a web page",
    detail: "u",
  } as const;
  assertEquals(apply([{ is: "progress", text: "Searching" }, ask]), {
    is: "running",
    runId: "r1",
    progress: ["Searching"],
    ask: { askId: "a1", capability: "Reads pages", action: "Read a web page", detail: "u" },
  });
  assertEquals(apply([ask, { is: "answered", askId: "a1", allow: true }]), running);
  // An answer to some other ask leaves this one.
  assertEquals(
    (apply([ask, { is: "answered", askId: "a0", allow: true }]) as { ask: unknown }).ask !== null,
    true,
  );
});

Deno.test("a run ends with its answer decoded, a failure, or being cancelled", () => {
  assertEquals(
    apply([{ is: "progress", text: "p" }, {
      is: "done",
      output: { n: 2 },
      costUsd: 0.1,
      files: [{ name: "a.csv", bytes: 3 }],
    }]),
    {
      is: "done",
      runId: "r1",
      progress: ["p"],
      output: { n: 2 },
      costUsd: 0.1,
      files: [{ name: "a.csv", bytes: 3 }],
    },
  );
  const misfit = apply([{ is: "done", output: { n: "two" }, costUsd: 0, files: [] }]);
  assertEquals(misfit.is, "failed");
  assertEquals(apply([{ is: "failed", message: "Too long" }]), {
    is: "failed",
    progress: [],
    message: "Too long",
  });
  assertEquals(apply([{ is: "cancelled" }]), { is: "cancelled", progress: [] });
});

Deno.test("events for a run that isn't going change nothing but its end", () => {
  const idle: RunView<Output> = { is: "idle" };
  assertEquals(apply([{ is: "progress", text: "x" }], idle), idle);
  assertEquals(
    apply([{ is: "ask", askId: "a", capability: "", action: "", detail: "" }], idle),
    idle,
  );
});

Deno.test("runs are at the assistant service, on the page's host", () => {
  assertEquals(
    runsBase({ protocol: "https:", hostname: "localhost" }, "9443"),
    "https://localhost:9443/api/widget-agent-runs/",
  );
});

Deno.test("streamed text splits into whole lines, keeping any partial one", () => {
  assertEquals(splitLines("", '{"a":1}\n{"b"'), { lines: ['{"a":1}'], pending: '{"b"' });
  assertEquals(splitLines('{"b"', ":2}\n\n"), { lines: ['{"b":2}'], pending: "" });
});
