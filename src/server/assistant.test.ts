import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Stream } from "effect";
import type { ChatEvent } from "../common/assistant.ts";
import { defaultLayout, emptyLayout, type Layout, newColumn } from "../common/model.ts";
import {
  conflictPrompt,
  invalidLayoutPrompt,
  widgetChecksFailedPrompt,
} from "./assistant-agent.ts";
import { type AgentProcess, AssistantIo, routeAssistant, runTurn } from "./assistant.ts";
import { type HttpRequest, IoError, ServerIo } from "./http.ts";
import { layoutText } from "./layout-store.ts";
import type { CheckOutcome } from "./widget-checks.ts";

const withColumn = (id: string): Layout => ({ ...emptyLayout, columns: [newColumn(id, "LuStar")] });

const init = (sessionId: string) =>
  JSON.stringify({ type: "system", subtype: "init", session_id: sessionId });
const say = (text: string) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });
const result = (costUsd: number) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "",
    total_cost_usd: costUsd,
  });

/**
 * One scripted run of the agent: what it prints, what it leaves in its layout
 * copy, and what it leaves in the widget source (if it changes it).
 */
type Run = {
  readonly lines: ReadonlyArray<string>;
  readonly edit: string | null;
  readonly widgets?: string;
  readonly code?: number;
  readonly stderr?: string;
};

/**
 * Fake pipes over in-memory files. `stored` is the saved layout file; `liveAfter`
 * replaces it after the given run, as if the user edited the page meanwhile.
 * `widgetChecks` and `layoutChecks` are the checks' outcomes, in order; they
 * pass once those run out. Formatting appends "!" to the widget source.
 */
const harness = (options: {
  stored: string | null;
  runs: ReadonlyArray<Run>;
  liveAfter?: { run: number; text: string };
  widgetChecks?: ReadonlyArray<CheckOutcome>;
  layoutChecks?: ReadonlyArray<CheckOutcome>;
  registry?: string;
  overrides?: Partial<AssistantIo["Type"]>;
}) => {
  const files = {
    stored: options.stored,
    workspace: "",
    temp: "",
    screenshot: null as Uint8Array | null,
    widgets: "v1",
  };
  const calls: Array<{ prompt: string; sessionId: string | null }> = [];
  const registries: Array<unknown> = [];
  const checks: Array<"widgets" | "layout"> = [];
  const widgetChecks = [...(options.widgetChecks ?? [])];
  const layoutChecks = [...(options.layoutChecks ?? [])];
  const workspaceWrites: Array<string> = [];

  const agentProcess = (run: Run): AgentProcess => ({
    // Split mid-line, as a pipe might.
    stdout: Stream.make(...run.lines.map((l) => l + "\n").join("").match(/[^]{1,7}/g) ?? []),
    exit: Effect.sync(() => {
      if (run.edit !== null) files.workspace = run.edit;
      if (run.widgets !== undefined) files.widgets = run.widgets;
      if (options.liveAfter?.run === calls.length - 1) files.stored = options.liveAfter.text;
      return { code: run.code ?? 0, stderr: run.stderr ?? "" };
    }),
  });

  const assistantIo = AssistantIo.of({
    readWorkspaceLayout: Effect.sync(() => files.workspace),
    writeWorkspaceLayout: (text) =>
      Effect.sync(() => {
        files.workspace = text;
        workspaceWrites.push(text);
      }),
    writeWorkspaceScreenshot: (jpeg) => Effect.sync(() => void (files.screenshot = jpeg)),
    removeWorkspaceScreenshot: Effect.sync(() => void (files.screenshot = null)),
    readRegistry: Effect.suspend(() =>
      options.registry === undefined
        ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound() }))
        : Effect.succeed(options.registry)
    ),
    fingerprintWidgets: Effect.sync(() => files.widgets),
    checkWidgets: Effect.sync(() => {
      checks.push("widgets");
      const outcome = widgetChecks.shift() ?? { ok: true };
      if (outcome.ok) files.widgets += "!";
      return outcome;
    }),
    checkWorkspaceLayout: Effect.sync(() => {
      checks.push("layout");
      return layoutChecks.shift() ?? { ok: true };
    }),
    startAgent: (prompt, sessionId, registry) =>
      Effect.suspend(() => {
        const run = options.runs.at(calls.length);
        calls.push({ prompt, sessionId });
        registries.push(registry);
        return run === undefined ? Effect.die("too many runs") : Effect.succeed(agentProcess(run));
      }),
    turnLock: Effect.runSync(Effect.makeSemaphore(1)),
    ...options.overrides,
  });

  const serverIo = ServerIo.of({
    readLayoutFile: Effect.suspend(() =>
      files.stored === null
        ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound() }))
        : Effect.succeed(files.stored)
    ),
    writeLayoutTempFile: (text) => Effect.sync(() => void (files.temp = text)),
    commitLayoutTempFile: Effect.sync(() => void (files.stored = files.temp)),
    readWidgetFile: () => Effect.die("unused"),
  });

  const provide = <A, E>(effect: Effect.Effect<A, E, AssistantIo | ServerIo>) =>
    effect.pipe(
      Effect.provideService(AssistantIo, assistantIo),
      Effect.provideService(ServerIo, serverIo),
    );

  const turn = async (
    message: string,
    sessionId: string | null = null,
    screenshot: Uint8Array | null = null,
  ) => {
    const events: Array<ChatEvent> = [];
    await Effect.runPromise(provide(
      runTurn({ message, sessionId, screenshot }, (e) => Effect.sync(() => void events.push(e))),
    ));
    // Durations vary from run to run.
    return events.map((e) => e.is === "done" ? { ...e, durationMs: 0 } : e);
  };

  return { files, calls, registries, checks, workspaceWrites, turn, provide, assistantIo };
};

const done = (costUsd: number | null): ChatEvent => ({ is: "done", costUsd, durationMs: 0 });

Deno.test("a turn that leaves the layout alone just relays the conversation", async () => {
  const h = harness({
    stored: null,
    runs: [{ lines: [init("s1"), say("Hello!"), result(0.01)], edit: null }],
  });
  assertEquals(await h.turn("Hi"), [
    { is: "session", sessionId: "s1" },
    { is: "text", text: "Hello!" },
    done(0.01),
  ]);
  assertEquals(h.calls, [{ prompt: "Hi", sessionId: null }]);
  assertEquals(h.workspaceWrites, [layoutText(defaultLayout)]);
  assertEquals(h.files.stored, null);
});

Deno.test("an edited, valid layout is saved and sent to the client", async () => {
  const layout = withColumn("c1");
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [{ lines: [init("s1"), result(0.02)], edit: JSON.stringify(layout) }],
  });
  assertEquals(await h.turn("Add a column", "s1"), [
    { is: "session", sessionId: "s1" },
    { is: "applied", layout },
    done(0.02),
  ]);
  assertEquals(h.files.stored, layoutText(layout));
  assertStringIncludes(h.calls.at(0)?.prompt ?? "", "[app] layout.json was refreshed");
});

Deno.test("a reformatted but identical layout counts as unchanged", async () => {
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [{ lines: [result(0)], edit: JSON.stringify(emptyLayout) }],
  });
  assertEquals(await h.turn("Tidy up"), [done(0)]);
});

Deno.test("an invalid layout is explained to the agent, which retries in the same session", async () => {
  const layout = withColumn("c1");
  const h = harness({
    stored: null,
    runs: [
      { lines: [init("s1"), result(0.1)], edit: `{"version": 2}` },
      { lines: [init("s1"), result(0.05)], edit: JSON.stringify(layout) },
    ],
  });
  const events = await h.turn("Add a column");
  assertEquals(events.map((e) => e.is), ["session", "rejected", "session", "applied", "done"]);
  assertEquals(events.at(-1), done(0.15000000000000002));
  const diagnostic = events.at(1)?.is === "rejected" ? events.at(1) : undefined;
  assertEquals(h.calls.at(1), {
    prompt: invalidLayoutPrompt(diagnostic && "message" in diagnostic ? diagnostic.message : ""),
    sessionId: "s1",
  });
  assertStringIncludes(h.calls.at(1)?.prompt ?? "", "version");
});

Deno.test("after repeated rejections the turn gives up without applying anything", async () => {
  const bad: Run = { lines: [result(0)], edit: "{" };
  const h = harness({ stored: null, runs: [bad, bad, bad] });
  const events = await h.turn("Break it");
  assertEquals(events.map((e) => e.is), ["rejected", "rejected", "error", "done"]);
  assertStringIncludes(JSON.stringify(events.at(2)), "rejected 3 times");
  assertEquals(h.calls.length, 3);
  assertEquals(h.files.stored, null);
});

Deno.test("if the user changed the page meanwhile, the agent redoes its work on the new layout", async () => {
  const theirs = withColumn("theirs");
  const ours = withColumn("ours");
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [
      { lines: [result(0)], edit: JSON.stringify(ours) },
      {
        lines: [result(0)],
        edit: JSON.stringify({ ...theirs, columns: [...theirs.columns, ...ours.columns] }),
      },
    ],
    liveAfter: { run: 0, text: layoutText(theirs) },
  });
  const events = await h.turn("Add a column");
  assertEquals(events.map((e) => e.is), ["rejected", "applied", "done"]);
  assertEquals(h.workspaceWrites, [layoutText(emptyLayout), layoutText(theirs)]);
  assertEquals(h.calls.at(1)?.prompt, conflictPrompt);
  assertEquals(JSON.parse(h.files.stored ?? "").columns.length, 2);
});

Deno.test("an agent that fails reports why", async () => {
  const crashed = harness({
    stored: null,
    runs: [{ lines: [say("Working")], edit: null, code: 1, stderr: "No conversation found" }],
  });
  assertEquals(await crashed.turn("Hi", "gone"), [
    { is: "text", text: "Working" },
    {
      is: "error",
      message: "The agent stopped unexpectedly (exit code 1). No conversation found",
    },
    done(null),
  ]);

  const errored = harness({
    stored: null,
    runs: [{
      lines: [JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true })],
      edit: null,
    }],
  });
  assertEquals(await errored.turn("Hi"), [
    { is: "error", message: "error_max_turns" },
    done(null),
  ]);
});

Deno.test("long stderr is trimmed to its end", async () => {
  const h = harness({
    stored: null,
    runs: [{ lines: [], edit: null, code: 2, stderr: "x".repeat(600) + "END" }],
  });
  const events = await h.turn("Hi");
  const error = events.at(0);
  assertEquals(error?.is, "error");
  assertStringIncludes(error && "message" in error ? error.message : "", `…${"x".repeat(497)}END`);
});

Deno.test("an agent that can't start is reported", async () => {
  const h = harness({
    stored: null,
    runs: [],
    overrides: { startAgent: () => Effect.fail(new IoError({ cause: "NotFound: claude" })) },
  });
  assertEquals(await h.turn("Hi"), [
    { is: "error", message: "Couldn't run Claude Code: NotFound: claude" },
    done(null),
  ]);
});

Deno.test("a corrupt saved layout or failing workspace stops the turn with an error", async () => {
  const corrupt = harness({ stored: "{", runs: [] });
  assertEquals((await corrupt.turn("Hi")).map((e) => e.is), ["error"]);

  const full = harness({
    stored: null,
    runs: [],
    overrides: { writeWorkspaceLayout: () => Effect.fail(new IoError({ cause: "disk full" })) },
  });
  assertEquals(await full.turn("Hi"), [{ is: "error", message: "disk full" }]);
});

Deno.test("only one turn runs at a time", async () => {
  const h = harness({ stored: null, runs: [] });
  const events: Array<ChatEvent> = [];
  await Effect.runPromise(
    h.provide(
      h.assistantIo.turnLock.withPermits(1)(
        runTurn(
          { message: "Hi", sessionId: null, screenshot: null },
          (e) => Effect.sync(() => void events.push(e)),
        ),
      ),
    ),
  );
  assertEquals(events.map((e) => e.is), ["error"]);
  assertStringIncludes(JSON.stringify(events), "still working");
});

const post = (body: string): HttpRequest => ({
  method: "POST",
  url: new URL("https://localhost:8443/api/assistant"),
  origin: null,
  body: Effect.succeed(body),
});

Deno.test("POST /api/assistant streams the turn's events as NDJSON", async () => {
  const h = harness({
    stored: null,
    runs: [{ lines: [init("s1"), say("Hi there"), result(0)], edit: null }],
  });
  const response = await Effect.runPromise(
    h.provide(
      routeAssistant(post(JSON.stringify({ message: "Hi", sessionId: null, screenshot: "AQID" }))),
    ),
  );
  assertEquals(response.headers["content-type"], "application/x-ndjson; charset=utf-8");
  const body = response.body instanceof ReadableStream
    ? await new Response(response.body).text()
    : "";
  const events = body.trim().split("\n").map((l) => JSON.parse(l));
  assertEquals(events.map((e) => e.is), ["session", "text", "done"]);
});

Deno.test("POST /api/assistant rejects malformed requests", async () => {
  const h = harness({ stored: null, runs: [] });
  for (
    const body of [
      "{",
      JSON.stringify({ message: "", sessionId: null, screenshot: null }),
      JSON.stringify({ message: "Hi", sessionId: null }),
      JSON.stringify({ message: "Hi", sessionId: null, screenshot: "not base64!" }),
    ]
  ) {
    const error = await Effect.runPromise(
      h.provide(routeAssistant(post(body))).pipe(Effect.flip),
    );
    assertEquals(error._tag, "BadRequest");
  }
});

Deno.test("a screenshot sent with the message is saved for the agent, and the prompt says so", async () => {
  const h = harness({ stored: null, runs: [{ lines: [init("s1"), result(0)], edit: null }] });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
  await h.turn("Make it cozier", null, jpeg);
  assertEquals(h.files.screenshot, jpeg);
  assertEquals(
    h.calls.at(0)?.prompt,
    "[app] screenshot.jpg shows the page as the user saw it just now.\n\nMake it cozier",
  );
});

Deno.test("without a screenshot, the last one is removed and the prompt doesn't mention it", async () => {
  const h = harness({ stored: null, runs: [{ lines: [init("s1"), result(0)], edit: null }] });
  h.files.screenshot = new Uint8Array([1]);
  await h.turn("Hi");
  assertEquals(h.files.screenshot, null);
  assertEquals(h.calls.at(0)?.prompt, "Hi");
});

Deno.test("failing to remove an old screenshot doesn't stop the turn", async () => {
  const h = harness({
    stored: null,
    runs: [{ lines: [init("s1"), result(0)], edit: null }],
    overrides: {
      removeWorkspaceScreenshot: Effect.fail(new IoError({ cause: new Deno.errors.NotFound() })),
    },
  });
  assertEquals(await h.turn("Hi"), [{ is: "session", sessionId: "s1" }, done(0)]);
});

const checking: ChatEvent = { is: "activity", label: "Checking and building the widget code" };

Deno.test("the agent is given the registry, or null if it can't be read", async () => {
  const registry = { widgets: [] };
  const h = harness({
    stored: null,
    runs: [{ lines: [result(0)], edit: null }],
    registry: JSON.stringify(registry),
  });
  await h.turn("Hi");
  assertEquals(h.registries, [registry]);

  for (const bad of [undefined, "{", `{"widgets": 3}`]) {
    const missing = harness({
      stored: null,
      runs: [{ lines: [result(0)], edit: null }],
      ...(bad === undefined ? {} : { registry: bad }),
    });
    await missing.turn("Hi");
    assertEquals(missing.registries, [null]);
  }
});

Deno.test("untouched widget code isn't checked, nor an unchanged layout", async () => {
  const h = harness({ stored: null, runs: [{ lines: [result(0)], edit: null }] });
  await h.turn("Hi");
  assertEquals(h.checks, []);
});

Deno.test("a changed layout's widget configs are checked before it's applied", async () => {
  const layout = withColumn("c1");
  const h = harness({
    stored: null,
    runs: [
      { lines: [result(0)], edit: JSON.stringify(layout) },
      { lines: [result(0)], edit: JSON.stringify(layout) },
    ],
    layoutChecks: [{ ok: false, diagnostic: "Widget w1: its config is invalid" }],
  });
  const events = await h.turn("Add a clock");
  assertEquals(events.map((e) => e.is), ["rejected", "applied", "done"]);
  assertEquals(h.checks, ["layout", "layout"]);
  assertEquals(h.calls.at(1)?.prompt, invalidLayoutPrompt("Widget w1: its config is invalid"));
});

Deno.test("changed widget code is checked; when it passes, so is the layout, even unchanged", async () => {
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [{ lines: [result(0)], edit: null, widgets: "v2" }],
  });
  assertEquals(await h.turn("Make the clock show seconds"), [checking, done(0)]);
  assertEquals(h.checks, ["widgets", "layout"]);
  assertEquals(h.files.stored, layoutText(emptyLayout));
});

Deno.test("failing widget checks are sent back to the agent, and nothing is applied until they pass", async () => {
  const layout = withColumn("c1");
  const h = harness({
    stored: null,
    runs: [
      { lines: [init("s1"), result(0.1)], edit: JSON.stringify(layout), widgets: "v2" },
      { lines: [result(0.1)], edit: null, widgets: "v3" },
    ],
    widgetChecks: [{ ok: false, diagnostic: "Lint failed: no-unused-vars" }],
  });
  const events = await h.turn("Add a stock ticker");
  assertEquals(events.map((e) => e.is), [
    "session",
    "activity",
    "rejected",
    "activity",
    "applied",
    "done",
  ]);
  assertEquals(h.calls.at(1), {
    prompt: widgetChecksFailedPrompt("Lint failed: no-unused-vars"),
    sessionId: "s1",
  });
  assertEquals(h.checks, ["widgets", "widgets", "layout"]);
  assertEquals(h.files.stored, layoutText(layout));
});

Deno.test("code that passed isn't checked again when only the layout is retried", async () => {
  const layout = withColumn("c1");
  const h = harness({
    stored: null,
    runs: [
      { lines: [result(0)], edit: `{"version": 2}`, widgets: "v2" },
      { lines: [result(0)], edit: JSON.stringify(layout) },
    ],
  });
  const events = await h.turn("Add a stock ticker");
  assertEquals(events.map((e) => e.is), ["activity", "rejected", "applied", "done"]);
  assertEquals(h.checks, ["widgets", "layout"]);
});

Deno.test("widget code that keeps failing is left in place, and the user is told", async () => {
  const failing: CheckOutcome = { ok: false, diagnostic: "Tests failed" };
  const h = harness({
    stored: null,
    runs: [1, 2, 3].map((n) => ({ lines: [result(0)], edit: null, widgets: `v${n + 1}` })),
    widgetChecks: [failing, failing, failing],
  });
  const events = await h.turn("Add a stock ticker");
  assertEquals(events.map((e) => e.is), [
    "activity",
    "rejected",
    "activity",
    "rejected",
    "activity",
    "error",
    "done",
  ]);
  assertStringIncludes(JSON.stringify(events.at(-2)), "left in src/client/widgets/");
  assertEquals(h.files.stored, null);
});
