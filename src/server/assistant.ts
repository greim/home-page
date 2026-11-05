/**
 * Functional core of the admin assistant. A turn copies the live layout into
 * the agent's workspace, runs the agent on the user's message, then checks any
 * widget code it changed and applies the workspace layout if it changed. Work
 * that's rejected (failing checks, an invalid layout, or a live layout that
 * changed meanwhile) is explained to the agent, which tries again.
 * Progress streams to the client as newline-delimited ChatEvents.
 */
import { Clock, Context, Effect, Either, Schema, type Scope, Stream } from "effect";
import { AssistantRequest, type ChatEvent } from "../common/assistant.ts";
import type { Layout } from "../common/model.ts";
import { Registry } from "../common/widgets.ts";
import { type AgentSignal, parseAgentLine } from "./agent-output.ts";
import {
  conflictPrompt,
  invalidLayoutPrompt,
  maxRetries,
  userPrompt,
  widgetChecksFailedPrompt,
} from "./assistant-agent.ts";
import { BadRequest, type HttpRequest, type HttpResponse, IoError, ServerIo } from "./http.ts";
import { decodeLayoutJson, layoutText, readLayout, writeLayout } from "./layout-store.ts";
import type { CheckOutcome } from "./widget-checks.ts";

/** A running agent process. */
export type AgentProcess = {
  /** Its standard output, as text in arbitrary chunks. */
  readonly stdout: Stream.Stream<string, IoError>;
  /** Resolves when it exits, with whatever it wrote to standard error. */
  readonly exit: Effect.Effect<{ readonly code: number; readonly stderr: string }, IoError>;
};

export class AssistantIo extends Context.Tag("AssistantIo")<
  AssistantIo,
  {
    readonly readWorkspaceLayout: Effect.Effect<string, IoError>;
    readonly writeWorkspaceLayout: (text: string) => Effect.Effect<void, IoError>;
    readonly writeWorkspaceScreenshot: (jpeg: Uint8Array) => Effect.Effect<void, IoError>;
    readonly removeWorkspaceScreenshot: Effect.Effect<void, IoError>;
    /** The widget build's registry.json, for the agent's prompt. */
    readonly readRegistry: Effect.Effect<string, IoError>;
    /** Starts one turn of the agent; it's killed if still running when the scope closes. */
    readonly startAgent: (
      prompt: string,
      sessionId: string | null,
      registry: Registry | null,
    ) => Effect.Effect<AgentProcess, IoError, Scope.Scope>;
    /** Changes whenever any file in the widget source does. */
    readonly fingerprintWidgets: Effect.Effect<string, IoError>;
    /** Formats, type checks, lints, tests and builds the widget source. */
    readonly checkWidgets: Effect.Effect<CheckOutcome, IoError>;
    /** Checks the workspace layout's widget configs against their manifests. */
    readonly checkWorkspaceLayout: Effect.Effect<CheckOutcome, IoError>;
    /** Held for the length of a turn, so turns never overlap. */
    readonly turnLock: Effect.Semaphore;
  }
>() {}

type Emit = (event: ChatEvent) => Effect.Effect<void>;

/** How one run of the agent ended. */
type AgentRun =
  | { ok: true; sessionId: string | null; costUsd: number | null }
  | { ok: false; message: string };

/** What became of the workspace layout after the agent's run. */
export type ApplyOutcome =
  | { is: "unchanged" }
  | { is: "applied"; layout: Layout }
  | { is: "invalid"; diagnostic: string }
  | { is: "conflict"; live: Layout };

type RunState = {
  readonly sessionId: string | null;
  readonly result: { ok: boolean; message: string; costUsd: number | null } | null;
};

const lastChars = (text: string, n: number) => text.length > n ? `…${text.slice(-n)}` : text;

const onSignal = (emit: Emit) => (state: RunState, signal: AgentSignal) => {
  switch (signal.is) {
    case "session":
      return emit({ is: "session", sessionId: signal.sessionId }).pipe(
        Effect.as({ ...state, sessionId: signal.sessionId }),
      );
    case "text":
    case "activity":
      return emit(signal).pipe(Effect.as(state));
    case "result":
      return Effect.succeed({ ...state, result: signal });
    default:
      return signal satisfies never;
  }
};

/** The registry, or null if it's missing or unreadable (the prompt says so). */
const registry = Effect.flatMap(AssistantIo, (io) => io.readRegistry).pipe(
  Effect.flatMap((text) =>
    Schema.decodeUnknown(Schema.parseJson(Registry))(text).pipe(Effect.orElseSucceed(() => null))
  ),
  Effect.orElseSucceed(() => null),
);

/** Runs the agent once, streaming what it says and does. */
const runAgent = (prompt: string, sessionId: string | null, emit: Emit) =>
  Effect.scoped(Effect.gen(function* () {
    const io = yield* AssistantIo;
    const agent = yield* io.startAgent(prompt, sessionId, yield* registry);
    const state = yield* agent.stdout.pipe(
      Stream.splitLines,
      Stream.mapConcat(parseAgentLine),
      Stream.runFoldEffect<RunState, AgentSignal, never, never>(
        { sessionId, result: null },
        onSignal(emit),
      ),
    );
    const exit = yield* agent.exit;
    if (state.result === null) {
      return {
        ok: false,
        message: `The agent stopped unexpectedly (exit code ${exit.code}). ${
          lastChars(exit.stderr.trim(), 500)
        }`.trim(),
      } satisfies AgentRun;
    }
    if (!state.result.ok) {
      return { ok: false, message: state.result.message } satisfies AgentRun;
    }
    return {
      ok: true,
      sessionId: state.sessionId,
      costUsd: state.result.costUsd,
    } satisfies AgentRun;
  })).pipe(
    Effect.catchTag("IoError", (e) =>
      Effect.succeed<AgentRun>({
        ok: false,
        message: `Couldn't run Claude Code: ${String(e.cause)}`,
      })),
  );

/**
 * Applies the workspace layout if the agent changed it, it's valid, and the
 * live layout is still the one the agent started from. Its widgets' configs are
 * checked when it changed, or when widget code did (which may have changed a
 * config's schema).
 */
const applyWorkspace = (snapshot: Layout, widgetsChanged: boolean) =>
  Effect.gen(function* () {
    const io = yield* AssistantIo;
    const text = yield* io.readWorkspaceLayout;
    const layoutChanged = text !== layoutText(snapshot);
    if (!layoutChanged && !widgetsChanged) {
      return { is: "unchanged" } satisfies ApplyOutcome;
    }
    const edited = layoutChanged ? decodeLayoutJson(text) : Either.right(snapshot);
    if (Either.isLeft(edited)) {
      return { is: "invalid", diagnostic: edited.left } satisfies ApplyOutcome;
    }
    const configs = yield* io.checkWorkspaceLayout;
    if (!configs.ok) {
      return { is: "invalid", diagnostic: configs.diagnostic } satisfies ApplyOutcome;
    }
    if (layoutText(edited.right) === layoutText(snapshot)) {
      return { is: "unchanged" } satisfies ApplyOutcome;
    }
    const live = yield* readLayout;
    if (layoutText(live) !== layoutText(snapshot)) {
      return { is: "conflict", live } satisfies ApplyOutcome;
    }
    yield* writeLayout(edited.right);
    return { is: "applied", layout: edited.right } satisfies ApplyOutcome;
  });

/** What became of the widget source after the agent's run. */
type WidgetsOutcome =
  | { is: "unchanged" }
  | { is: "passed"; fingerprint: string }
  | { is: "failed"; diagnostic: string };

/** Checks the widget source if it changed since it last passed. */
const checkWidgets = (passed: string, emit: Emit) =>
  Effect.gen(function* () {
    const io = yield* AssistantIo;
    if ((yield* io.fingerprintWidgets) === passed) {
      return { is: "unchanged" } satisfies WidgetsOutcome;
    }
    yield* emit({ is: "activity", label: "Checking and building the widget code" });
    const checked = yield* io.checkWidgets;
    if (!checked.ok) {
      return { is: "failed", diagnostic: checked.diagnostic } satisfies WidgetsOutcome;
    }
    // Formatting may have changed it.
    return { is: "passed", fingerprint: yield* io.fingerprintWidgets } satisfies WidgetsOutcome;
  });

const addCost = (a: number | null, b: number | null) => a === null ? b : a + (b ?? 0);

/** One turn: the agent's runs on the user's message, plus any retries. */
const turn = (request: AssistantRequest, emit: Emit) =>
  Effect.gen(function* () {
    const io = yield* AssistantIo;
    const started = yield* Clock.currentTimeMillis;
    let snapshot = yield* readLayout;
    yield* io.writeWorkspaceLayout(layoutText(snapshot));
    // Without a screenshot, an old one mustn't pass for this one. (The prompt says
    // whether there's one, so failing to remove it is harmless.)
    yield* request.screenshot === null
      ? Effect.ignore(io.removeWorkspaceScreenshot)
      : io.writeWorkspaceScreenshot(request.screenshot);

    let prompt = userPrompt(request.message, {
      resumed: request.sessionId !== null,
      screenshot: request.screenshot !== null,
    });
    let sessionId = request.sessionId;
    let costUsd: number | null = null;
    // The widget source as it last passed the checks, and whether this turn changed it.
    let passedWidgets = yield* io.fingerprintWidgets;
    let widgetsChanged = false;
    for (let attempt = 0;; attempt++) {
      const run = yield* runAgent(prompt, sessionId, emit);
      if (!run.ok) {
        yield* emit({ is: "error", message: run.message });
        break;
      }
      sessionId = run.sessionId;
      costUsd = addCost(costUsd, run.costUsd);
      const widgets = yield* checkWidgets(passedWidgets, emit);
      if (widgets.is === "passed") {
        passedWidgets = widgets.fingerprint;
        widgetsChanged = true;
      }
      const outcome = widgets.is === "failed"
        ? { is: "widgets-failed" as const, diagnostic: widgets.diagnostic }
        : yield* applyWorkspace(snapshot, widgetsChanged);
      if (outcome.is === "unchanged") break;
      if (outcome.is === "applied") {
        yield* emit({ is: "applied", layout: outcome.layout });
        break;
      }
      if (attempt === maxRetries) {
        yield* emit({
          is: "error",
          message: `The assistant's changes were rejected ${
            maxRetries + 1
          } times, so nothing was applied.${
            outcome.is === "widgets-failed"
              ? " Its widget code is left in src/client/widgets/ as it was, failing the checks."
              : ""
          }`,
        });
        break;
      }
      if (outcome.is === "widgets-failed") {
        yield* emit({ is: "rejected", message: outcome.diagnostic });
        prompt = widgetChecksFailedPrompt(outcome.diagnostic);
        continue;
      }
      if (outcome.is === "invalid") {
        yield* emit({ is: "rejected", message: outcome.diagnostic });
        prompt = invalidLayoutPrompt(outcome.diagnostic);
        continue;
      }
      yield* emit({
        is: "rejected",
        message: "The page changed while the assistant was working; it's redoing its changes.",
      });
      snapshot = outcome.live;
      yield* io.writeWorkspaceLayout(layoutText(snapshot));
      prompt = conflictPrompt;
    }
    const finished = yield* Clock.currentTimeMillis;
    yield* emit({ is: "done", costUsd, durationMs: finished - started });
  });

/** Runs a turn unless one is already running, reporting any failure as an error event. */
export const runTurn = (request: AssistantRequest, emit: Emit) =>
  Effect.gen(function* () {
    const io = yield* AssistantIo;
    const ran = yield* io.turnLock.withPermitsIfAvailable(1)(
      turn(request, emit).pipe(
        Effect.catchTags({
          IoError: (e) => emit({ is: "error", message: String(e.cause) }),
          CorruptData: (e) => emit({ is: "error", message: e.message }),
        }),
      ),
    );
    if (ran._tag === "None") {
      yield* emit({
        is: "error",
        message: "The assistant is still working on another request. Try again when it's done.",
      });
    }
  });

const decodeRequest = (raw: string) =>
  Either.flatMap(
    Either.try({ try: (): unknown => JSON.parse(raw), catch: String }),
    (parsed) =>
      Either.mapLeft(
        Schema.decodeUnknownEither(AssistantRequest)(parsed),
        (error) => error.message,
      ),
  );

const encoder = new TextEncoder();

/** POST /api/assistant: runs a turn, streaming its events as NDJSON. */
export const routeAssistant = (
  request: HttpRequest,
): Effect.Effect<HttpResponse, BadRequest | IoError, ServerIo | AssistantIo> =>
  Effect.gen(function* () {
    const parsed = decodeRequest(yield* request.body);
    if (Either.isLeft(parsed)) {
      return yield* new BadRequest({ message: parsed.left });
    }
    const events = Stream.asyncScoped<ChatEvent, never, ServerIo | AssistantIo>((emit) =>
      runTurn(parsed.right, (event) => Effect.promise(() => emit.single(event))).pipe(
        Effect.ensuring(Effect.promise(() => emit.end())),
        // Ends with the stream, so a client that goes away stops the agent.
        Effect.forkScoped,
      )
    );
    const body = yield* events.pipe(
      Stream.map((event) => encoder.encode(JSON.stringify(event) + "\n")),
      Stream.toReadableStreamEffect(),
    );
    return {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
      body,
    } satisfies HttpResponse;
  });
