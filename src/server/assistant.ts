/**
 * Functional core of the assistant service. A turn copies the live layout into
 * the agent's workspace, sends the user's message to the agent's session, and,
 * when the agent finishes, applies the workspace layout if it changed. A layout
 * that's rejected (invalid, or the live one changed meanwhile) is explained to
 * the agent, which tries again. The agent's permission requests and questions
 * wait for the user's answers. Everything that happens goes to the event log.
 */
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Either,
  Exit,
  Option,
  Queue,
  Ref,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import {
  type Answer,
  type Capabilities,
  type ChatEvent,
  type ImageType,
  type LoggedEvent,
  type PermissionMode,
  Question,
  type SendMessage,
  type SessionSummary,
} from "../common/assistant.ts";
import type { Layout } from "../common/model.ts";
import { Registry } from "../common/widgets.ts";
import { historySignals, parseAgentMessage } from "./agent-output.ts";
import {
  type AgentSettings,
  conflictPrompt,
  invalidLayoutPrompt,
  maxRetries,
  userPrompt,
} from "./assistant-agent.ts";
import type { EventLog } from "./event-log.ts";
import { IoError, ServerIo } from "./http.ts";
import { decodeLayoutJson, layoutText, readLayout, writeLayout } from "./layout-store.ts";
import type { CheckOutcome } from "./widget-checks.ts";
import { changedFiles, type Fingerprint, type ModuleGraphs, restartsFor } from "./restarts.ts";

/** How changes that need a restart are put into effect. */
export type RestartSettings = {
  /**
   * The services run under launchd, which restarts them. When they don't (e.g. run from a
   * terminal while developing), the user is told to restart them instead.
   */
  readonly supervised: boolean;
  /** How often to check whether the restarted main server is back, and how many times. */
  readonly pollMs: number;
  readonly attempts: number;
};

/** A tool use Claude Code wants the user's say on (or the AskUserQuestion tool). */
export type ToolRequest = {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  /** Claude Code's description of it, if any. */
  readonly description: string | null;
  /** Permission rules Claude Code suggests saving, passed back as is for "always". */
  readonly suggestions: ReadonlyArray<unknown>;
};

/** The answer to a {@link ToolRequest}, in the shape the Agent SDK expects. */
export type ToolDecision =
  | {
    readonly behavior: "allow";
    readonly updatedInput: Record<string, unknown>;
    readonly updatedPermissions?: ReadonlyArray<unknown>;
  }
  | { readonly behavior: "deny"; readonly message: string };

/** An image the user attached to a message. */
export type Image = { readonly mediaType: ImageType; readonly data: Uint8Array };

/** An open conversation with the agent. */
export type AgentSession = {
  /** Sends a user message; the agent's messages in reply come from `next`. */
  readonly send: (text: string, images: ReadonlyArray<Image>) => Effect.Effect<void>;
  /** Switches the model for what follows; null for Claude Code's default. */
  readonly setModel: (model: string | null) => Effect.Effect<void, IoError>;
  /** The agent's next message (as the SDK yields it); none once the session has ended. */
  readonly next: Effect.Effect<Option.Option<unknown>, IoError>;
  /** Stops what the agent is doing; its turn ends with an error result. */
  readonly interrupt: Effect.Effect<void, IoError>;
  readonly setMode: (mode: PermissionMode) => Effect.Effect<void, IoError>;
  /** How full the context window is (0 to 100), and the model in use. */
  readonly contextUsage: Effect.Effect<
    { readonly percent: number; readonly model: string },
    IoError
  >;
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
    /** Checks the workspace layout's widget configs against their manifests. */
    readonly checkWorkspaceLayout: Effect.Effect<CheckOutcome, IoError>;
    /** Claude Code's slash commands and skills in the repo, and the models it offers. */
    readonly capabilities: Effect.Effect<Capabilities, IoError>;
    /** The repo's files that code changes could be in, to see what a turn changed. */
    readonly fingerprint: Effect.Effect<Fingerprint, IoError>;
    /** Which files each process loads. */
    readonly moduleGraphs: Effect.Effect<ModuleGraphs, IoError>;
    /** Has launchd restart the main server. */
    readonly restartApp: Effect.Effect<void, IoError>;
    /** Whether the main server is taking connections. */
    readonly appListening: Effect.Effect<boolean>;
    /** Ends this process, for launchd to start it again with its new code. */
    readonly exitForRestart: Effect.Effect<void>;
    /** The repo's past sessions, as the SDK lists them, newest first. */
    readonly listSessions: Effect.Effect<ReadonlyArray<unknown>, IoError>;
    /** A past session's transcript, as the SDK gives it. */
    readonly readSessionMessages: (
      sessionId: string,
    ) => Effect.Effect<ReadonlyArray<unknown>, IoError>;
    /**
     * Opens a session with the agent (resuming one, if given), which lasts until the scope
     * closes. `decide` answers the agent's permission requests.
     */
    readonly startSession: (options: {
      readonly resume: string | null;
      /** The model to start with; null for Claude Code's default. */
      readonly model: string | null;
      /** The permission mode to start in. */
      readonly mode: PermissionMode;
      readonly registry: Registry | null;
      readonly decide: (request: ToolRequest) => Effect.Effect<ToolDecision>;
    }) => Effect.Effect<AgentSession, IoError, Scope.Scope>;
  }
>() {}

/** What the service does with a message: start a turn, or refuse while one runs. */
export type SendResult = { ok: true; log: string; after: number } | { ok: false };

export type Assistant = {
  readonly send: (message: SendMessage) => Effect.Effect<SendResult>;
  /** Answers a waiting permission request or question; false if there's none such waiting. */
  readonly answer: (requestId: string, answer: Answer) => Effect.Effect<boolean>;
  /** The log's events after `after`, or null if `log` isn't this log (the service restarted). */
  readonly events: (log: string, after: number) => Stream.Stream<LoggedEvent> | null;
  /** Which log the service is keeping, and its last event's number, for a client to follow it. */
  readonly state: Effect.Effect<{ readonly log: string; readonly latest: number }>;
  /** Stops the running turn; false if there's none. */
  readonly interrupt: Effect.Effect<boolean, IoError>;
  /**
   * Changes a conversation's permission mode: right away if it's the open session, else
   * (e.g. before a new conversation's first message) the session it next opens starts in it.
   */
  readonly setMode: (
    mode: PermissionMode,
    sessionId: string | null,
  ) => Effect.Effect<void, IoError>;
  /** Uses this model (null: the default) from now on, in the open session and new ones. */
  readonly setModel: (model: string | null) => Effect.Effect<void, IoError>;
  readonly capabilities: Effect.Effect<Capabilities, IoError>;
  readonly sessions: Effect.Effect<ReadonlyArray<SessionSummary>, IoError>;
  /** A past session, as events to replay. */
  readonly history: (sessionId: string) => Effect.Effect<ReadonlyArray<ChatEvent>, IoError>;
};

/** What became of the workspace layout after the agent's run. */
export type ApplyOutcome =
  | { is: "unchanged" }
  | { is: "applied"; layout: Layout }
  | { is: "invalid"; diagnostic: string }
  | { is: "conflict"; live: Layout };

type AgentRun = { ok: true; costUsd: number | null } | { ok: false; message: string };

type Waiting = {
  readonly kind: "permission" | "question";
  readonly answer: Deferred.Deferred<Answer>;
};

type OpenSession = {
  /** Null until the agent reports it, for a new conversation. */
  readonly sessionId: string | null;
  readonly session: AgentSession;
  readonly scope: Scope.CloseableScope;
  /** The results of the user's messages, in order, as the session's reader sees them. */
  readonly results: Queue.Queue<AgentRun>;
  /** The agent's process has gone: the next message opens the session again. */
  readonly ended: boolean;
};

/**
 * Whose turn is under way. In the user's, `awaiting` says the agent is working on a
 * message of theirs (rather than the turn applying the agent's work).
 */
type Turn =
  | { is: "idle" }
  | { is: "user"; awaiting: boolean }
  | { is: "agent" }
  /** The service is about to restart itself; it takes no new turn. */
  | { is: "restarting" };

/**
 * Longest a permission request's detail gets, so a huge input can't flood the chat. A
 * plan, which the user reads in full to approve it, may be longer.
 */
const maxDetail = 2000;
const maxPlan = 20_000;

const clip = (text: string, max = maxDetail): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** What a tool use would do, for the user to judge: the command, file or URL, if it has one. */
export const requestDetail = (request: ToolRequest, root = ""): string => {
  for (const key of ["command", "file_path", "url", "notebook_path", "pattern", "plan"]) {
    const value = request.input[key];
    if (typeof value !== "string") continue;
    // Files inside the repo are shown relative to it, as elsewhere in the chat.
    const prefix = root === "" || root.endsWith("/") ? root : `${root}/`;
    const isPath = key === "file_path" || key === "notebook_path";
    return clip(
      isPath && prefix !== "" && value.startsWith(prefix) ? value.slice(prefix.length) : value,
      key === "plan" ? maxPlan : maxDetail,
    );
  }
  return clip(request.description ?? JSON.stringify(request.input));
};

const Questions = Schema.Struct({ questions: Schema.Array(Question) });

/** The SDK's answer for what the user chose. */
export const toolDecision = (request: ToolRequest, answer: Answer): ToolDecision => {
  if (answer.is === "question") {
    return { behavior: "allow", updatedInput: { ...request.input, answers: answer.answers } };
  }
  switch (answer.choice) {
    case "allow":
      return { behavior: "allow", updatedInput: { ...request.input } };
    case "always":
      return {
        behavior: "allow",
        updatedInput: { ...request.input },
        updatedPermissions: request.suggestions,
      };
    case "accept-edits":
      return {
        behavior: "allow",
        updatedInput: { ...request.input },
        updatedPermissions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }],
      };
    case "deny":
      return {
        behavior: "deny",
        message: request.toolName === planTool
          ? "The user wants to keep planning: ask what to change, or revise the plan."
          : "The user declined this.",
      };
    default:
      return answer.choice satisfies never;
  }
};

/** The tool the agent uses to present a plan for approval, when in plan mode. */
export const planTool = "ExitPlanMode";

const settledOutcome = (answer: Answer) =>
  answer.is === "question" ? "answered" : answer.choice === "deny" ? "denied" : "allowed";

const addCost = (a: number | null, b: number | null) => a === null ? b : a + (b ?? 0);

const SdkSession = Schema.Struct({
  sessionId: Schema.String,
  summary: Schema.optionalWith(Schema.String, { default: () => "" }),
  customTitle: Schema.optional(Schema.String),
  firstPrompt: Schema.optional(Schema.String),
  lastModified: Schema.Number,
});

/** Longest a session's title gets in the list. */
const maxTitle = 80;

/** The sessions the SDK lists, as the client shows them: titled, newest first. */
export const sessionSummaries = (raw: ReadonlyArray<unknown>): ReadonlyArray<SessionSummary> =>
  raw.flatMap((r) => {
    const info = Schema.decodeUnknownOption(SdkSession)(r);
    if (Option.isNone(info)) return [];
    const { sessionId, summary, customTitle, firstPrompt, lastModified } = info.value;
    const title = (customTitle ?? (summary !== "" ? summary : firstPrompt ?? "")).trim() ||
      "Untitled";
    return [{
      sessionId,
      title: title.length > maxTitle ? `${title.slice(0, maxTitle)}…` : title,
      lastModified,
    }];
  }).sort((a, b) => b.lastModified - a.lastModified);

/** The registry, or null if it's missing or unreadable (the prompt says so). */
const readRegistry = Effect.flatMap(AssistantIo, (io) => io.readRegistry).pipe(
  Effect.flatMap((text) =>
    Schema.decodeUnknown(Schema.parseJson(Registry))(text).pipe(Effect.orElseSucceed(() => null))
  ),
  Effect.orElseSucceed(() => null),
);

/**
 * Applies the workspace layout if the agent changed it, it's valid, and the
 * live layout is still the one the agent started from.
 */
const applyWorkspace = (snapshot: Layout) =>
  Effect.gen(function* () {
    const io = yield* AssistantIo;
    const text = yield* io.readWorkspaceLayout;
    if (text === layoutText(snapshot)) {
      return { is: "unchanged" } satisfies ApplyOutcome;
    }
    const edited = decodeLayoutJson(text);
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

/** The assistant service, logging what happens to `log`. */
export const makeAssistant = (
  settings: AgentSettings,
  log: EventLog,
  restart: RestartSettings,
): Effect.Effect<Assistant, never, AssistantIo | ServerIo> =>
  Effect.gen(function* () {
    const context = yield* Effect.context<AssistantIo | ServerIo>();
    /**
     * Whose turn is under way: none, the user's, or the agent's own (one it began without
     * a message, e.g. when a background task it started finished).
     */
    const turnOf = yield* SubscriptionRef.make<Turn>({ is: "idle" });
    /**
     * Waits while the user's turn is between the agent's result and what the turn does
     * next (apply the layout, or send a retry): what the agent says meanwhile can't be
     * placed until then.
     */
    const placeable = turnOf.changes.pipe(
      Stream.filter((t) => t.is !== "user" || t.awaiting),
      Stream.runHead,
    );
    /** When the agent's own turn began, for its summary, and the repo's files then. */
    const agentTurnStarted = yield* Ref.make(0);
    const agentTurnFiles = yield* Ref.make<Fingerprint | null>(null);
    const waiting = yield* Ref.make(new Map<string, Waiting>());
    const requests = yield* Ref.make(0);
    const open = yield* Ref.make<OpenSession | null>(null);
    /** The model the user chose, for sessions from now on; null for Claude Code's default. */
    const model = yield* Ref.make<string | null>(null);
    /** The mode the next session starts in: what the user chose before its first message. */
    const pendingMode = yield* Ref.make<PermissionMode>("default");
    const currentSession = Effect.map(Ref.get(open), (o) => o?.sessionId ?? null);
    const emit = (event: ChatEvent) =>
      Effect.flatMap(currentSession, (s) => Effect.asVoid(log.publish(event, s)));
    const emitTransient = (event: ChatEvent) =>
      Effect.flatMap(currentSession, (s) => log.publishTransient(event, s));

    /** Asks the user about a tool use and waits for their answer. */
    const decide = (request: ToolRequest): Effect.Effect<ToolDecision> =>
      Effect.gen(function* () {
        const requestId = `r${yield* Ref.updateAndGet(requests, (n) => n + 1)}`;
        const isQuestion = request.toolName === "AskUserQuestion";
        const questions = isQuestion
          ? Schema.decodeUnknownOption(Questions)(request.input)
          : Option.none();
        if (isQuestion && Option.isNone(questions)) {
          return { behavior: "deny", message: "The app couldn't show these questions." } as const;
        }
        const answer = yield* Deferred.make<Answer>();
        const kind = isQuestion ? "question" : "permission";
        yield* Ref.update(waiting, (m) => new Map(m).set(requestId, { kind, answer }));
        yield* Option.match(questions, {
          onNone: () =>
            emit({
              is: "permission",
              requestId,
              tool: request.toolName,
              detail: requestDetail(request, settings.repoDir),
              canAlways: request.suggestions.length > 0,
            }),
          onSome: (q) => emit({ is: "question", requestId, questions: q.questions }),
        });
        const given = yield* Deferred.await(answer).pipe(
          Effect.onInterrupt(() => emit({ is: "settled", requestId, outcome: "cancelled" })),
          Effect.ensuring(Ref.update(waiting, (m) => {
            const next = new Map(m);
            next.delete(requestId);
            return next;
          })),
        );
        yield* emit({ is: "settled", requestId, outcome: settledOutcome(given) });
        return toolDecision(request, given);
      });

    /** The repo's files now, to compare with after a turn; null if they couldn't be read. */
    const repoFiles = Effect.flatMap(AssistantIo, (io) => io.fingerprint).pipe(
      Effect.orElseSucceed(() => null),
      Effect.provide(context),
    );

    /** Restarts the main server, and says how it went once it's back (or isn't). */
    const restartApp = Effect.gen(function* () {
      const io = yield* AssistantIo;
      if (!restart.supervised) {
        yield* emit({
          is: "notice",
          tone: "info",
          text: "The server's code changed. Restart it to use it: deno task restart-service app " +
            "(deno task dev restarts by itself).",
        });
        return;
      }
      yield* emit({
        is: "notice",
        tone: "info",
        text: "Restarting the server to use the new code…",
      });
      yield* io.restartApp;
      // Wait for the old one to go, then for the new one to answer (it bundles the page first).
      yield* poll(Effect.map(io.appListening, (up) => !up), restart.attempts);
      const back = yield* poll(io.appListening, restart.attempts);
      yield* emit(
        back
          ? { is: "notice", tone: "success", text: "The server is back, running the new code." }
          : {
            is: "notice",
            tone: "error",
            text: "The server hasn't come back. Its errors are in logs/server.log.",
          },
      );
    }).pipe(
      Effect.catchTag("IoError", (e) =>
        emit({
          is: "notice",
          tone: "error",
          text: `Couldn't restart the server: ${String(e.cause)}`,
        })),
    );

    /** Whether `check` comes true, trying it every `pollMs` up to `attempts` times. */
    const poll = (check: Effect.Effect<boolean>, attempts: number): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        for (let i = 0; i < attempts; i++) {
          if (yield* check) return true;
          yield* Effect.sleep(restart.pollMs);
        }
        return false;
      });

    /** Restarts this service, once no turn is under way, for it to run its new code. */
    const restartSelf = Effect.gen(function* () {
      if (!restart.supervised) {
        yield* emit({
          is: "notice",
          tone: "info",
          text: "The assistant service's code changed. Restart it to use it: " +
            "deno task restart-service assistant.",
        });
        return;
      }
      // Take no new turn from the moment none is under way.
      yield* turnOf.changes.pipe(
        Stream.mapEffect(() =>
          SubscriptionRef.modify(
            turnOf,
            (t): [boolean, Turn] => t.is === "idle" ? [true, { is: "restarting" }] : [false, t],
          )
        ),
        Stream.filter((claimed) => claimed),
        Stream.runHead,
      );
      yield* emit({
        is: "notice",
        tone: "info",
        text: "Restarting the assistant service to use its new code. Conversations carry on.",
      });
      yield* (yield* AssistantIo).exitForRestart;
    });

    /** Puts a turn's changes to the repo into effect: restarts, and reloading the page. */
    const afterTurn = (before: Fingerprint | null) =>
      Effect.gen(function* () {
        if (before === null) return;
        const io = yield* AssistantIo;
        const changed = changedFiles(before, yield* io.fingerprint);
        if (changed.size === 0) return;
        const needs = restartsFor(changed, yield* io.moduleGraphs);
        if (needs.app) yield* restartApp;
        if (needs.reload) yield* emit({ is: "reload" });
        if (needs.assistant) yield* restartSelf;
      }).pipe(
        Effect.catchTag("IoError", (e) =>
          emit({
            is: "notice",
            tone: "error",
            text: `Couldn't tell whether the changes need a restart: ${String(e.cause)}`,
          })),
        Effect.provide(context),
      );

    /** Says how much the conversation has used: its cost so far, and how full its context is. */
    const reportUsage = (session: AgentSession, costUsd: number | null) =>
      Effect.gen(function* () {
        const context = yield* Effect.either(session.contextUsage);
        yield* emit({
          is: "usage",
          costUsd,
          contextPercent: Either.isRight(context) ? context.right.percent : null,
          model: Either.isRight(context) ? context.right.model : null,
        });
      });

    const closeOpen = Effect.gen(function* () {
      const current = yield* Ref.getAndSet(open, null);
      if (current !== null) yield* Scope.close(current.scope, Exit.void);
    });

    /** Starts the agent's own turn, unless one (the user's or its own) is under way. */
    const beginAgentTurn = Effect.gen(function* () {
      const began = yield* SubscriptionRef.modify(
        turnOf,
        (t): [boolean, Turn] => t.is === "idle" ? [true, { is: "agent" }] : [false, t],
      );
      if (!began) {
        return;
      }
      yield* Ref.set(agentTurnStarted, yield* Clock.currentTimeMillis);
      yield* Ref.set(agentTurnFiles, yield* repoFiles);
      yield* emit({ is: "started" });
    });

    /** Ends the agent's own turn, if one is under way. */
    const endAgentTurn = (costUsd: number | null, error: string | null) =>
      Effect.gen(function* () {
        const ended = yield* SubscriptionRef.modify(
          turnOf,
          (t): [boolean, Turn] => t.is === "agent" ? [true, { is: "idle" }] : [false, t],
        );
        if (!ended) return;
        if (error !== null) yield* emit({ is: "error", message: error });
        const started = yield* Ref.get(agentTurnStarted);
        yield* emit({
          is: "done",
          costUsd,
          durationMs: (yield* Clock.currentTimeMillis) - started,
        });
        yield* Effect.forkDaemon(afterTurn(yield* Ref.get(agentTurnFiles)));
      });

    /**
     * Relays everything the agent says until its session ends, between turns too: what
     * it does on its own begins a turn of its own. The results of what the user sent go
     * to `results`, for the turn waiting on them.
     */
    /**
     * `costSoFar` is the session's cumulative cost as last reported (the SDK reports a running
     * total, not each result's own), so each result's own cost is the difference. Null when
     * unknown: a resumed session's first total includes the turns before it was resumed.
     */
    const read = (
      session: AgentSession,
      results: Queue.Enqueue<AgentRun>,
      costSoFar: Ref.Ref<number | null>,
    ) =>
      Effect.gen(function* () {
        while (true) {
          const next = yield* Effect.either(session.next);
          if (Either.isLeft(next) || Option.isNone(next.right)) {
            const ended = Either.isLeft(next)
              ? `Couldn't run Claude Code: ${String(next.left.cause)}`
              : "The assistant's session ended unexpectedly.";
            yield* Ref.update(open, (o) => o?.session === session ? { ...o, ended: true } : o);
            yield* Queue.offer(results, { ok: false, message: ended });
            yield* endAgentTurn(null, ended);
            return;
          }
          for (const signal of parseAgentMessage(settings.repoDir, next.right.value)) {
            if (signal.is !== "session" && signal.is !== "mode" && signal.is !== "user") {
              yield* placeable;
            }
            switch (signal.is) {
              case "session":
                yield* Ref.update(
                  open,
                  (o) => o?.session === session ? { ...o, sessionId: signal.sessionId } : o,
                );
                yield* emit(signal);
                break;
              case "mode":
                yield* emit(signal);
                break;
              case "text":
              case "tool":
              case "tool-result":
                yield* beginAgentTurn;
                yield* emit(signal);
                break;
              case "delta":
                yield* beginAgentTurn;
                yield* emitTransient(signal);
                break;
              case "user":
                // Only in history: the client shows what it sent.
                break;
              case "result": {
                const before = yield* Ref.getAndSet(costSoFar, signal.costUsd);
                const costUsd = before === null || signal.costUsd === null
                  ? null
                  : signal.costUsd - before;
                yield* reportUsage(session, signal.costUsd);
                const turn = yield* SubscriptionRef.get(turnOf);
                if (turn.is === "agent") {
                  yield* endAgentTurn(costUsd, signal.ok ? null : signal.message);
                } else if (turn.is === "user") {
                  yield* SubscriptionRef.set(turnOf, { is: "user", awaiting: false });
                  yield* Queue.offer(
                    results,
                    signal.ok ? { ok: true, costUsd } : { ok: false, message: signal.message },
                  );
                }
                // With no turn under way, a result is for nothing anyone waits on.
                break;
              }
              default:
                return signal satisfies never;
            }
          }
        }
      });

    /** The open session if it's the one asked for, else a newly opened (or resumed) one. */
    const sessionFor = (sessionId: string | null) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(open);
        if (
          current !== null && !current.ended && sessionId !== null &&
          current.sessionId === sessionId
        ) {
          return current;
        }
        yield* closeOpen;
        const io = yield* AssistantIo;
        const scope = yield* Scope.make();
        const session = yield* io.startSession({
          resume: sessionId,
          model: yield* Ref.get(model),
          // A mode chosen before the conversation's first message; it applies to that one only.
          mode: yield* Ref.getAndSet(pendingMode, "default"),
          registry: yield* readRegistry,
          decide,
        }).pipe(
          Scope.extend(scope),
          Effect.tapError(() => Scope.close(scope, Exit.void)),
        );
        const results = yield* Queue.unbounded<AgentRun>();
        const opened: OpenSession = { sessionId, session, scope, results, ended: false };
        yield* Ref.set(open, opened);
        // A new session has cost nothing yet; a resumed one, an unknown amount.
        const costSoFar = yield* Ref.make<number | null>(sessionId === null ? 0 : null);
        yield* Effect.forkIn(read(session, results, costSoFar), scope);
        return opened;
      });

    /** Sends the agent a message and waits for the result of its work on it. */
    const runAgent = (opened: OpenSession, prompt: string, images: ReadonlyArray<Image> = []) =>
      Effect.gen(function* () {
        // A result already waiting isn't this message's.
        yield* Queue.takeAll(opened.results);
        yield* SubscriptionRef.set(turnOf, { is: "user", awaiting: true });
        yield* opened.session.send(prompt, images);
        return yield* Queue.take(opened.results);
      });

    /** One turn: the agent's runs on the user's message, plus any retries. Returns its cost. */
    const turn = (request: SendMessage) =>
      Effect.gen(function* () {
        const io = yield* AssistantIo;
        let snapshot = yield* readLayout;
        yield* io.writeWorkspaceLayout(layoutText(snapshot));
        // Without a screenshot, an old one mustn't pass for this one. (The prompt says
        // whether there's one, so failing to remove it is harmless.)
        yield* request.screenshot === null
          ? Effect.ignore(io.removeWorkspaceScreenshot)
          : io.writeWorkspaceScreenshot(request.screenshot);

        const opened = yield* sessionFor(request.sessionId);
        let prompt = userPrompt(request.message, {
          resumed: request.sessionId !== null,
          screenshot: request.screenshot !== null,
        }, settings);
        let costUsd: number | null = null;
        for (let attempt = 0;; attempt++) {
          // The user's images go with their message, not with the app's retries.
          const run = yield* runAgent(opened, prompt, attempt === 0 ? request.images : []);
          if (!run.ok) {
            yield* emit({ is: "error", message: run.message });
            return costUsd;
          }
          costUsd = addCost(costUsd, run.costUsd);
          const outcome = yield* applyWorkspace(snapshot);
          switch (outcome.is) {
            case "unchanged":
              return costUsd;
            case "applied":
              yield* emit({ is: "applied", layout: outcome.layout });
              return costUsd;
            case "invalid":
            case "conflict":
              break;
            default:
              return outcome satisfies never;
          }
          if (attempt === maxRetries) {
            yield* emit({
              is: "error",
              message: `The assistant's layout was rejected ${
                maxRetries + 1
              } times, so it wasn't applied.`,
            });
            return costUsd;
          }
          if (outcome.is === "invalid") {
            yield* emit({ is: "rejected", message: outcome.diagnostic });
            prompt = invalidLayoutPrompt(settings, outcome.diagnostic);
            continue;
          }
          yield* emit({
            is: "rejected",
            message: "The page changed while the assistant was working; it's redoing its changes.",
          });
          snapshot = outcome.live;
          yield* io.writeWorkspaceLayout(layoutText(snapshot));
          prompt = conflictPrompt(settings);
        }
      }).pipe(
        Effect.catchTags({
          IoError: (e) => emit({ is: "error", message: String(e.cause) }).pipe(Effect.as(null)),
          CorruptData: (e) => emit({ is: "error", message: e.message }).pipe(Effect.as(null)),
        }),
      );

    /** A turn, always ending with a "done" event, so clients know it's over. */
    const fullTurn = (request: SendMessage) =>
      Effect.gen(function* () {
        const started = yield* Clock.currentTimeMillis;
        const before = yield* repoFiles;
        const costUsd = yield* turn(request);
        const finished = yield* Clock.currentTimeMillis;
        yield* emit({ is: "done", costUsd, durationMs: finished - started });
        yield* Effect.forkDaemon(afterTurn(before));
      }).pipe(
        // A defect is a bug: it still reaches the log, but clients mustn't wait forever.
        Effect.onExit((exit) =>
          Exit.isFailure(exit) && !Cause.isInterruptedOnly(exit.cause)
            ? Effect.andThen(
              emit({ is: "error", message: "The assistant service hit an internal error." }),
              emit({ is: "done", costUsd: null, durationMs: 0 }),
            )
            : Effect.void
        ),
        Effect.ensuring(SubscriptionRef.set(turnOf, { is: "idle" })),
      );

    return {
      send: (request) =>
        Effect.gen(function* () {
          const started = yield* SubscriptionRef.modify(
            turnOf,
            (t): [boolean, Turn] =>
              t.is === "idle" ? [true, { is: "user", awaiting: false }] : [false, t],
          );
          if (!started) return { ok: false } satisfies SendResult;
          const after = yield* log.latest;
          yield* Effect.forkDaemon(Effect.provide(fullTurn(request), context));
          return { ok: true, log: log.id, after } satisfies SendResult;
        }),
      answer: (requestId, answer) =>
        Effect.gen(function* () {
          const found = (yield* Ref.get(waiting)).get(requestId);
          if (found === undefined || found.kind !== answer.is) return false;
          return yield* Deferred.succeed(found.answer, answer);
        }),
      events: (id, after) => id === log.id ? log.after(after) : null,
      state: Effect.map(log.latest, (latest) => ({ log: log.id, latest })),
      interrupt: Effect.gen(function* () {
        const current = yield* Ref.get(open);
        if ((yield* SubscriptionRef.get(turnOf)).is === "idle" || current === null) return false;
        yield* current.session.interrupt;
        return true;
      }),
      setMode: (mode, sessionId) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(open);
          if (
            current !== null && !current.ended && sessionId !== null &&
            current.sessionId === sessionId
          ) {
            yield* current.session.setMode(mode);
            return;
          }
          // Not the open session (e.g. a new conversation, or a past one being continued):
          // the session its next message opens starts in it.
          yield* Ref.set(pendingMode, mode);
        }),
      setModel: (chosen) =>
        Effect.gen(function* () {
          yield* Ref.set(model, chosen);
          const current = yield* Ref.get(open);
          if (current !== null && !current.ended) yield* current.session.setModel(chosen);
        }),
      capabilities: Effect.flatMap(AssistantIo, (io) => io.capabilities).pipe(
        Effect.provide(context),
      ),
      sessions: Effect.flatMap(AssistantIo, (io) => io.listSessions).pipe(
        Effect.map(sessionSummaries),
        Effect.provide(context),
      ),
      history: (sessionId) =>
        Effect.flatMap(AssistantIo, (io) => io.readSessionMessages(sessionId)).pipe(
          Effect.map((messages) =>
            historySignals(settings.repoDir, messages).flatMap((s): ReadonlyArray<ChatEvent> =>
              s.is === "user" || s.is === "text" || s.is === "tool" || s.is === "tool-result"
                ? [s]
                : []
            )
          ),
          Effect.provide(context),
        ),
    } satisfies Assistant;
  });
