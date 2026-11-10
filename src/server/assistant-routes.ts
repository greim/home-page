/**
 * Functional core of the assistant service's HTTP API. The page is served from
 * another port (another origin), so requests come cross-origin: only the app's
 * own origins are answered, since the agent behind this API can run commands.
 *
 *   POST /api/assistant/messages             start a turn (409 while one runs)
 *   GET  /api/assistant/events?log={id}&after={seq}
 *                                            the event log, as NDJSON, from `after` on (410
 *                                            if `log` is an earlier run's: it's gone)
 *   POST /api/assistant/answers/{requestId}  answer a permission request or question
 *   POST /api/assistant/interrupt            stop the running turn (409 if none)
 *   POST /api/assistant/mode                 set a conversation's permission mode (before its
 *                                            first message: the mode it starts in)
 *   POST /api/assistant/model                the model to use from now on (null: the default)
 *   GET  /api/assistant/capabilities         Claude Code's slash commands, skills and models
 *   GET  /api/assistant/sessions             the repo's past sessions, newest first
 *   GET  /api/assistant/sessions/{id}        a past session, as events to replay
 *   GET  /api/assistant/state                the log being kept, and its last event's number
 *   GET  /api/assistant/health               is the service up
 *
 *   /api/widget-apis/...                     the widget APIs it serves: agent-runs (see
 *                                            src/common/apis/agent-runs.ts)
 */
import { Context, Effect, Either, Schema, Stream } from "effect";
import { Answer, SendMessage, SetMode, SetModel } from "../common/assistant.ts";
import type { Assistant } from "./assistant.ts";
import { agentRunsServed } from "./agent-runs-api.ts";
import { handleWidgetApis, isWidgetApiRequest } from "./widget-api-routes.ts";
import type { WidgetAgentRuns } from "./widget-agents.ts";
import {
  type HttpRequest,
  type HttpResponse,
  type IoError,
  json,
  methodNotAllowed,
  text,
} from "./http.ts";

export class AssistantService extends Context.Tag("AssistantService")<
  AssistantService,
  Assistant
>() {}

export type AssistantSite = {
  /** Hosts (`name:port`) this service answers to. Guards DNS rebinding. */
  readonly hosts: ReadonlySet<string>;
  /** The page's origins: the only ones allowed to call this service. */
  readonly appOrigins: ReadonlySet<string>;
};

const prefix = "/api/assistant/";

const decodeJson = <A, I>(schema: Schema.Schema<A, I>, raw: string): Either.Either<A, string> =>
  Either.flatMap(
    Either.try({ try: (): unknown => JSON.parse(raw), catch: String }),
    (parsed) => Either.mapLeft(Schema.decodeUnknownEither(schema)(parsed), (e) => e.message),
  );

const encoder = new TextEncoder();

/** A non-negative whole number from a query parameter, else null. */
const seqParam = (value: string | null): number | null => {
  if (value === null) return 0;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

const route = (
  request: HttpRequest,
): Effect.Effect<HttpResponse, never, AssistantService | WidgetAgentRuns> =>
  Effect.gen(function* () {
    if (isWidgetApiRequest(request)) return yield* handleWidgetApis(request, [agentRunsServed]);
    const assistant = yield* AssistantService;
    const path = request.url.pathname.startsWith(prefix)
      ? request.url.pathname.slice(prefix.length)
      : null;

    if (path === "health") {
      return request.method === "GET" ? json({ ok: true }) : methodNotAllowed("GET");
    }
    if (path === "state") {
      return request.method === "GET" ? json(yield* assistant.state) : methodNotAllowed("GET");
    }
    if (path === "messages") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = decodeJson(SendMessage, yield* Effect.orElseSucceed(request.body, () => ""));
      if (Either.isLeft(body)) return text(400, body.left);
      const sent = yield* assistant.send(body.right);
      return sent.ok
        ? json({ log: sent.log, after: sent.after }, 202)
        : text(409, "The assistant is still working on another request. Try again when it's done.");
    }
    if (path === "events") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const after = seqParam(request.url.searchParams.get("after"));
      if (after === null) return text(400, "`after` must be a whole number");
      const events = assistant.events(request.url.searchParams.get("log") ?? "", after);
      if (events === null) {
        return text(
          410,
          "The assistant service restarted, so that conversation's events are gone.",
        );
      }
      const body = yield* events.pipe(
        Stream.map((logged) => encoder.encode(JSON.stringify(logged) + "\n")),
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
    }
    if (path !== null && path.startsWith("answers/")) {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = decodeJson(Answer, yield* Effect.orElseSucceed(request.body, () => ""));
      if (Either.isLeft(body)) return text(400, body.left);
      const answered = yield* assistant.answer(path.slice("answers/".length), body.right);
      return answered
        ? { status: 204, headers: {}, body: null }
        : text(404, "Nothing is waiting for that answer");
    }
    if (path === "interrupt") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return (yield* assistant.interrupt.pipe(Effect.either)).pipe(Either.match({
        onLeft: failed,
        onRight: (stopped) =>
          stopped ? noContent : text(409, "The assistant isn't working on anything."),
      }));
    }
    if (path === "mode") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = decodeJson(SetMode, yield* Effect.orElseSucceed(request.body, () => ""));
      if (Either.isLeft(body)) return text(400, body.left);
      return (yield* assistant.setMode(body.right.mode, body.right.sessionId).pipe(Effect.either))
        .pipe(
          Either.match({ onLeft: failed, onRight: () => noContent }),
        );
    }
    if (path === "model") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const body = decodeJson(SetModel, yield* Effect.orElseSucceed(request.body, () => ""));
      if (Either.isLeft(body)) return text(400, body.left);
      return (yield* assistant.setModel(body.right.model).pipe(Effect.either)).pipe(
        Either.match({ onLeft: failed, onRight: () => noContent }),
      );
    }
    if (path === "capabilities") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return (yield* assistant.capabilities.pipe(Effect.either)).pipe(
        Either.match({ onLeft: failed, onRight: (c) => json(c) }),
      );
    }
    if (path === "sessions") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return (yield* assistant.sessions.pipe(Effect.either)).pipe(Either.match({
        onLeft: failed,
        onRight: (sessions) => json({ sessions }),
      }));
    }
    if (path !== null && path.startsWith("sessions/")) {
      if (request.method !== "GET") return methodNotAllowed("GET");
      const sessionId = decodeURIComponent(path.slice("sessions/".length));
      return (yield* assistant.history(sessionId).pipe(Effect.either)).pipe(Either.match({
        onLeft: failed,
        onRight: (events) => json({ events }),
      }));
    }
    return text(404, "Not found");
  });

const noContent: HttpResponse = { status: 204, headers: {}, body: null };

/** Something the service needed (the SDK, a file) failed. */
const failed = (e: IoError): HttpResponse => text(500, String(e.cause));

/** Headers letting the app's page read the response. */
const corsHeaders = (origin: string): Record<string, string> => ({
  "access-control-allow-origin": origin,
  "vary": "origin",
});

export const handleAssistant = (
  request: HttpRequest,
  site: AssistantSite,
): Effect.Effect<HttpResponse, never, AssistantService | WidgetAgentRuns> => {
  if (!site.hosts.has(request.url.host)) {
    return Effect.succeed(text(421, "Misdirected request"));
  }
  // No Origin: not a browser page (e.g. curl on this machine), which could run claude anyway.
  if (request.origin !== null && !site.appOrigins.has(request.origin)) {
    return Effect.succeed(text(403, "Only the home page may use the assistant"));
  }
  const cors = request.origin === null ? {} : corsHeaders(request.origin);
  if (request.method === "OPTIONS") {
    return Effect.succeed({
      status: 204,
      headers: {
        ...cors,
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      },
      body: null,
    });
  }
  return route(request).pipe(
    Effect.map((response) => ({ ...response, headers: { ...response.headers, ...cors } })),
  );
};
