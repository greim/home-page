/** Functional core of the client's server communication. */
import { Context, Data, Effect, Either, Schema, Stream } from "effect";
import { AssistantRequest, ChatEvent } from "../common/assistant.ts";
import { BackgroundImageUrl, Layout } from "../common/model.ts";

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
    /** POSTs JSON and streams the response body. */
    readonly stream: (path: string, json: string) => Effect.Effect<HttpStream, ApiError>;
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

export const saveLayout = (
  layout: Layout,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    yield* http.request("PUT", "/api/layout", JSON.stringify(layout), jsonType).pipe(
      Effect.flatMap(expectOk),
    );
  });

const ImageList = Schema.Struct({ images: Schema.Array(BackgroundImageUrl) });
const SavedImage = Schema.Struct({ url: BackgroundImageUrl });

/** URLs of every available background image: built-in ones first, then saved ones. */
export const listBackgrounds: Effect.Effect<ReadonlyArray<string>, ApiError, Http> = requestJson(
  ImageList,
  "GET",
  "/api/backgrounds",
  null,
  jsonType,
).pipe(Effect.map((r) => r.images));

/** Saves an image file from disk on the server; returns its URL. */
export const uploadBackground = (
  bytes: Uint8Array<ArrayBuffer>,
): Effect.Effect<string, ApiError, Http> =>
  requestJson(SavedImage, "POST", "/api/backgrounds", bytes, "application/octet-stream").pipe(
    Effect.map((r) => r.url),
  );

/** Has the server download an image from the web and save it; returns its local URL. */
export const fetchBackground = (url: string): Effect.Effect<string, ApiError, Http> =>
  requestJson(
    SavedImage,
    "POST",
    "/api/backgrounds/fetch",
    JSON.stringify({ url }),
    jsonType,
  ).pipe(Effect.map((r) => r.url));

const decodeChatEvent = (line: string) =>
  Either.try({ try: (): unknown => JSON.parse(line), catch: String }).pipe(
    Either.flatMap((json) => Either.mapLeft(Schema.decodeUnknownEither(ChatEvent)(json), String)),
    Either.mapLeft((message) => new ApiError({ message: `Invalid event from server: ${message}` })),
  );

/** Sends the admin assistant a message, handing each event to `onEvent` as it arrives. */
export const askAssistant = (
  request: AssistantRequest,
  onEvent: (event: ChatEvent) => void,
): Effect.Effect<void, ApiError, Http> =>
  Effect.gen(function* () {
    const http = yield* Http;
    const body = yield* Schema.encode(AssistantRequest)(request).pipe(
      Effect.mapError((e) => new ApiError({ message: e.message })),
    );
    const response = yield* http.stream("/api/assistant", JSON.stringify(body));
    if (response.status < 200 || response.status >= 300) {
      const text = yield* Stream.mkString(response.chunks);
      return yield* new ApiError({ message: `Server responded ${response.status}: ${text}` });
    }
    yield* response.chunks.pipe(
      Stream.splitLines,
      Stream.filter((line) => line.trim() !== ""),
      Stream.mapEffect(decodeChatEvent),
      Stream.runForEach((event) => Effect.sync(() => onEvent(event))),
    );
  });
