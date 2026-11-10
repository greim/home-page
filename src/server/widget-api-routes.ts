/**
 * Functional core of serving widget APIs (src/common/widget-apis.ts): finding the
 * API and operation a request is for, decoding its input, running the API's handler,
 * and encoding what it gives. Each server serves its own APIs through this, with
 * handlers that do their I/O through their own pipes.
 */
import { Data, Effect, Either, type ParseResult, Schema, Stream } from "effect";
import {
  type AnyApi,
  type AnyOp,
  type ApiResult,
  Caller,
  type CallOp,
  type LinkOp,
  RequestBody,
  type StreamOp,
  widgetApisPath,
} from "../common/widget-apis.ts";
import { type HttpRequest, type HttpResponse, json, methodNotAllowed, text } from "./http.ts";

/** Something a handler needed failed: the caller gets `failed`, with the message. */
export class HandlerFailed extends Data.TaggedError("HandlerFailed")<{
  readonly message: string;
}> {}

type Type<S> = S extends Schema.Schema<infer A, infer _I, infer _R> ? A : never;

/** What serves one operation, given its decoded input and who's calling. */
export type Handler<Op, R> = Op extends CallOp<infer I, infer O, infer E>
  ? (input: Type<I>, caller: Caller) => Effect.Effect<ApiResult<Type<O>, Type<E>>, HandlerFailed, R>
  : Op extends StreamOp<infer I, infer T, infer E> ? (
      input: Type<I>,
      caller: Caller,
    ) => Effect.Effect<ApiResult<Stream.Stream<Type<T>>, Type<E>>, HandlerFailed, R>
  : Op extends LinkOp<infer I>
    ? (input: Type<I>, caller: Caller) => Effect.Effect<HttpResponse, never, R>
  : never;

export type Handlers<D extends AnyApi, R> = {
  readonly [K in keyof D["operations"]]: Handler<D["operations"][K], R>;
};

/** An API with what serves it, for a server's list. */
export type ServedApi<R> = {
  readonly api: AnyApi;
  readonly handlers: Readonly<
    Record<string, (input: unknown, caller: Caller) => Effect.Effect<unknown, HandlerFailed, R>>
  >;
};

/**
 * Pairs an API with its handlers, checking there's one of the right shape for each
 * operation. Name what the handlers need (`R`), which isn't inferred:
 * `serve<typeof geocodeApi, ServerIo>(geocodeApi, { ... })`.
 */
export const serve = <D extends AnyApi, R = never>(
  api: D,
  handlers: Handlers<D, R>,
): ServedApi<R> => ({
  api,
  handlers: handlers as unknown as ServedApi<R>["handlers"],
});

const encoder = new TextEncoder();

const ndjson = (lines: Stream.Stream<unknown>) =>
  Stream.toReadableStreamEffect(
    lines.pipe(Stream.map((line) => encoder.encode(JSON.stringify(line) + "\n"))),
  );

/** A handler's failure, as its answer. */
const handlerFailed = (e: HandlerFailed) => text(500, e.message);

/** Encodes a result of a call or stream, with its operation's schemas. */
const encodeResult = (
  op: CallOp<Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext>,
  result: ApiResult<unknown, unknown>,
): Either.Either<unknown, ParseResult.ParseError> =>
  result.ok
    ? Either.map(Schema.encodeUnknownEither(op.output)(result.value), (value) => ({
      ok: true,
      value,
    }))
    : Either.map(Schema.encodeUnknownEither(op.errors)(result.error), (error) => ({
      ok: false,
      error,
    }));

const call = <R>(
  op: CallOp<Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext>,
  handler: ServedApi<R>["handlers"][string],
  input: unknown,
  caller: Caller,
) =>
  Effect.gen(function* () {
    const result = (yield* handler(input, caller)) as ApiResult<unknown, unknown>;
    return Either.match(encodeResult(op, result), {
      onLeft: (e) => text(500, `The answer didn't fit the API: ${e.message}`),
      onRight: (answer) => json(answer),
    });
  }).pipe(Effect.catchTag("HandlerFailed", (e) => Effect.succeed(handlerFailed(e))));

const streamed = <R>(
  op: StreamOp<Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext, Schema.Schema.AnyNoContext>,
  handler: ServedApi<R>["handlers"][string],
  input: unknown,
  caller: Caller,
) =>
  Effect.gen(function* () {
    const result = (yield* handler(input, caller)) as ApiResult<Stream.Stream<unknown>, unknown>;
    const encodeItem = Schema.encodeUnknownSync(op.item);
    const lines: Stream.Stream<unknown> = result.ok
      ? Stream.concat(
        // An item that doesn't encode is a bug: the stream stops, without its end.
        result.value.pipe(Stream.map((item) => ({ item: encodeItem(item) }))),
        Stream.make({ end: { ok: true } }),
      )
      : Stream.make({
        end: { ok: false, error: Schema.encodeUnknownSync(op.errors)(result.error) },
      });
    return {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
      body: yield* ndjson(lines),
    } satisfies HttpResponse;
  }).pipe(Effect.catchTag("HandlerFailed", (e) => Effect.succeed(handlerFailed(e))));

const decodeWith = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Either.mapLeft(Schema.decodeUnknownEither(schema)(value), (e) => e.message);

const parse = (raw: string) =>
  Either.try({ try: (): unknown => JSON.parse(raw), catch: () => "it isn't JSON" });

/** A call or stream's caller and input, from its body. */
const readBody = (op: AnyOp & { readonly maxBytes: number }, raw: string) => {
  if (raw.length > op.maxBytes) {
    return Either.left(`That's too much: the most is ${op.maxBytes.toLocaleString("en")} bytes.`);
  }
  return Either.flatMap(
    Either.flatMap(parse(raw), (json) => decodeWith(RequestBody, json)),
    (body) =>
      Either.map(decodeWith(op.input as Schema.Schema<unknown>, body.input), (input) => ({
        caller: body.caller,
        input,
      })),
  );
};

/** A link's caller and input, from its query. */
const readQuery = (op: LinkOp<Schema.Schema.AnyNoContext>, url: URL) =>
  Either.flatMap(
    Either.flatMap(
      parse(url.searchParams.get("caller") ?? ""),
      (json) => decodeWith(Caller, json),
    ),
    (caller) =>
      Either.flatMap(
        parse(url.searchParams.get("input") ?? ""),
        (json) =>
          Either.map(
            decodeWith(op.input as Schema.Schema<unknown>, json),
            (input) => ({ caller, input }),
          ),
      ),
  );

/** Whether a request is for a widget API: those are answered by {@link handleWidgetApis}. */
export const isWidgetApiRequest = (request: HttpRequest): boolean =>
  request.url.pathname.startsWith(widgetApisPath);

/** Answers a request under `/api/widget-apis/`, with one of `apis`. */
export const handleWidgetApis = <R>(
  request: HttpRequest,
  apis: ReadonlyArray<ServedApi<R>>,
): Effect.Effect<HttpResponse, never, R> =>
  Effect.gen(function* () {
    const parts = request.url.pathname.slice(widgetApisPath.length).split("/");
    const [apiName = "", opName = "", ...rest] = parts.map(decodeURIComponent);
    const served = apis.find((a) => a.api.name === apiName);
    const op: AnyOp | undefined = served?.api.operations[opName];
    const handler = served?.handlers[opName];
    if (rest.length > 0 || op === undefined || handler === undefined) {
      return text(404, `There's no widget API operation "${apiName}/${opName}" here.`);
    }
    switch (op.is) {
      case "link": {
        if (request.method !== "GET") return methodNotAllowed("GET");
        const read = readQuery(op, request.url);
        if (Either.isLeft(read)) return text(400, read.left);
        const response: HttpResponse = (yield* handler(read.right.input, read.right.caller).pipe(
          Effect.catchTag("HandlerFailed", (e) => Effect.succeed(handlerFailed(e))),
        )) as HttpResponse;
        return response;
      }
      case "call":
      case "stream": {
        if (request.method !== "POST") return methodNotAllowed("POST");
        const read = readBody(op, yield* Effect.orElseSucceed(request.body, () => ""));
        if (Either.isLeft(read)) return text(400, read.left);
        const { input, caller } = read.right;
        return op.is === "call"
          ? yield* call(op, handler, input, caller)
          : yield* streamed(op, handler, input, caller);
      }
      default:
        return op satisfies never;
    }
  });
