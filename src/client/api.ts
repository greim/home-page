/** Functional core of the client's server communication. */
import { Context, Data, Effect, Either, Schema, Stream } from "effect";
import {
  Answer,
  Capabilities,
  type ChatEvent,
  endsTurn,
  LoggedEvent,
  type PermissionMode,
  SendAccepted,
  SendMessage,
  ServiceState,
  SessionHistory,
  SessionList,
  type SessionSummary,
  SetMode,
  SetModel,
} from "../common/assistant.ts";
import { Layout } from "../common/model.ts";
import { Registry, registryFile, widgetAssetsPath } from "../common/widgets.ts";

export class ApiError extends Data.TaggedError("ApiError")<{
  message: string;
}> {}

export type HttpResult = { readonly status: number; readonly text: string };

export type HttpBody = string | Uint8Array<ArrayBuffer> | null;

/** A response whose body is read as it arrives. */
export type HttpStream = {
  readonly status: number;
  /** The body as text, in arbitrary chunks. */
  readonly chunks: Stream.Stream<string, ApiError>;
};

export class Http extends Context.Tag("Http")<
  Http,
  {
    readonly request: (
      method: "GET" | "PUT" | "POST",
      path: string,
      body: HttpBody,
      contentType: string,
    ) => Effect.Effect<HttpResult, ApiError>;
    /** GETs a URL and streams the response body. Interrupting it closes the connection. */
    readonly stream: (url: string) => Effect.Effect<HttpStream, ApiError>;
  }
>() {}

const jsonType = "application/json";

const expectOk = (result: HttpResult) =>
  result.status >= 200 && result.status < 300 ? Effect.succeed(result.text) : Effect.fail(
    new ApiError({
      message: `Server responded ${result.status}: ${result.text}`,
    }),
  );

/** Sends a request and decodes a JSON response with `schema`. */
const requestJson = <A, I>(
  schema: Schema.Schema<A, I>,
  method: "GET" | "PUT" | "POST",
  path: string,
  body: HttpBody,
  contentType: string,
): Effect.Effect<A, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const text = yield* http.request(method, path, body, contentType).pipe(
      Effect.flatMap(expectOk),
    );
    const parsed = Either.try({
      try: (): unknown => JSON.parse(text),
      catch: String,
    }).pipe(
      Either.flatMap((json) => Either.mapLeft(Schema.decodeUnknownEither(schema)(json), String)),
    );
    if (Either.isLeft(parsed)) {
      return yield* new ApiError({
        message: `Invalid response from server: ${parsed.left}`,
      });
    }
    return parsed.right;
  });

export const loadLayout: Effect.Effect<Layout, ApiError, Http> = requestJson(
  Layout,
  "GET",
  "/api/layout",
  null,
  jsonType,
);

/** The widget types the widget build found. */
export const loadWidgetRegistry: Effect.Effect<Registry, ApiError, Http> = requestJson(
  Registry,
  "GET",
  `${widgetAssetsPath}${registryFile}`,
  null,
  jsonType,
);

export const saveLayout = (
  layout: Layout,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    yield* http.request("PUT", "/api/layout", JSON.stringify(layout), jsonType).pipe(
      Effect.flatMap(expectOk),
    );
  });

/** The assistant service's address: its own port, on the host the page was loaded from. */
export const assistantBase = (page: { protocol: string; hostname: string }, port: string): string =>
  `${page.protocol}//${page.hostname}:${port}/api/assistant`;

const encodeJson = <A, I>(schema: Schema.Schema<A, I>, value: A) =>
  Schema.encode(schema)(value).pipe(
    Effect.map((encoded) => JSON.stringify(encoded)),
    Effect.mapError((e) => new ApiError({ message: e.message })),
  );

/** Sends the assistant a message; where its turn's events start in the service's log. */
export const sendToAssistant = (
  base: string,
  message: SendMessage,
): Effect.Effect<SendAccepted, ApiError, Http> =>
  Effect.gen(function* () {
    const body = yield* encodeJson(SendMessage, message);
    return yield* requestJson(SendAccepted, "POST", `${base}/messages`, body, jsonType);
  });

/** Answers a permission request or question the assistant is waiting on. */
export const answerAssistant = (
  base: string,
  requestId: string,
  answer: Answer,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const body = yield* encodeJson(Answer, answer);
    yield* http.request("POST", `${base}/answers/${encodeURIComponent(requestId)}`, body, jsonType)
      .pipe(Effect.flatMap(expectOk));
  });

const decodeLoggedEvent = (line: string) =>
  Either.try({ try: (): unknown => JSON.parse(line), catch: String }).pipe(
    Either.flatMap((json) => Either.mapLeft(Schema.decodeUnknownEither(LoggedEvent)(json), String)),
    Either.mapLeft((message) =>
      new ApiError({ message: `Invalid event from the assistant: ${message}` })
    ),
  );

/** Which log the assistant service is keeping, and the number of its last event. */
export const assistantState = (base: string): Effect.Effect<ServiceState, ApiError, Http> =>
  requestJson(ServiceState, "GET", `${base}/state`, null, jsonType);

/**
 * Follows the assistant's event log `log` from after `after`, handing each event to
 * `onEvent`: until a turn ends, or (`untilDone` false) for as long as the connection lasts.
 */
export const followAssistant = (
  base: string,
  log: string,
  after: number,
  onEvent: (logged: LoggedEvent) => void,
  untilDone = true,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const response = yield* http.stream(
      `${base}/events?log=${encodeURIComponent(log)}&after=${after}`,
    );
    if (response.status < 200 || response.status >= 300) {
      const text = yield* Stream.mkString(response.chunks);
      return yield* new ApiError({
        message: `The assistant responded ${response.status}: ${text}`,
      });
    }
    yield* response.chunks.pipe(
      Stream.splitLines,
      Stream.filter((line) => line.trim() !== ""),
      Stream.mapEffect(decodeLoggedEvent),
      Stream.tap((logged) => Effect.sync(() => onEvent(logged))),
      Stream.takeUntil((logged) => untilDone && endsTurn(logged.event)),
      Stream.runDrain,
    );
  });

/** Stops the assistant's running turn. */
export const interruptAssistant = (base: string): Effect.Effect<void, ApiError, Http> =>
  Effect.flatMap(Http, (http) => http.request("POST", `${base}/interrupt`, null, jsonType)).pipe(
    Effect.flatMap(expectOk),
    Effect.asVoid,
  );

/** Sets the open conversation's permission mode. */
/** Has the assistant use this model from now on (null: Claude Code's default). */
export const setAssistantModel = (
  base: string,
  model: string | null,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const body = yield* encodeJson(SetModel, { model });
    yield* http.request("POST", `${base}/model`, body, jsonType).pipe(Effect.flatMap(expectOk));
  });

/** Claude Code's slash commands, skills and models in the repo. */
export const loadAssistantCapabilities = (
  base: string,
): Effect.Effect<Capabilities, ApiError, Http> =>
  requestJson(Capabilities, "GET", `${base}/capabilities`, null, jsonType);

/** Sets a conversation's permission mode (`sessionId` null: one that hasn't started yet). */
export const setAssistantMode = (
  base: string,
  mode: PermissionMode,
  sessionId: string | null,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const body = yield* encodeJson(SetMode, { mode, sessionId });
    yield* http.request("POST", `${base}/mode`, body, jsonType).pipe(Effect.flatMap(expectOk));
  });

/** The repo's past conversations, newest first. */
export const listAssistantSessions = (
  base: string,
): Effect.Effect<ReadonlyArray<SessionSummary>, ApiError, Http> =>
  requestJson(SessionList, "GET", `${base}/sessions`, null, jsonType).pipe(
    Effect.map((list) => list.sessions),
  );

/** A past conversation, as events to replay. */
export const loadAssistantSession = (
  base: string,
  sessionId: string,
): Effect.Effect<ReadonlyArray<ChatEvent>, ApiError, Http> =>
  requestJson(
    SessionHistory,
    "GET",
    `${base}/sessions/${encodeURIComponent(sessionId)}`,
    null,
    jsonType,
  ).pipe(Effect.map((history) => history.events));
