/**
 * Widget APIs: typed services the page gives widgets, each defined once here (in
 * `src/common/apis/`) and served by one of the app's servers. From the definition
 * come the server's routing (src/server/widget-api-routes.ts), the page's client
 * (src/client/widget-api-client.ts), and the type widgets code against
 * (`ApiClient`). See the `widget-apis` skill.
 *
 * Calls never reject: they resolve to an `ApiResult`, failing with the API's own
 * errors (tagged by `is`, each with a `message`) or one of the `ApiFailure`s every
 * API shares.
 *
 * On the wire, under `/api/widget-apis/<api>/<operation>`:
 *   call    POST `{ caller, input }`, answered `{ ok: true, value }` or `{ ok: false, error }`
 *   stream  POST `{ caller, input }`, answered with NDJSON: `{ item }` lines, then `{ end }`
 *   link    GET `?caller=&input=` (both JSON): whatever the browser loads
 */
import { Either, Schema } from "effect";

export const widgetApisPath = "/api/widget-apis/";

/** The server that runs an API: the page's own, or the assistant service (on its own port). */
export type ApiServer = "main" | "assistant";

/** The widget a client was built for, sent with each request. The page fills it in. */
export const Caller = Schema.Struct({ widgetType: Schema.String, widgetId: Schema.String });
export type Caller = typeof Caller.Type;

/** The failures every API shares. */
export const ApiFailure = Schema.Struct({
  is: Schema.Literal(
    /** The input didn't fit the operation's schema. */
    "bad-input",
    /** The server couldn't be reached, or the connection was lost. */
    "unreachable",
    /** The server, or a service behind it, failed. */
    "failed",
    /** The answer didn't fit the operation's schema. */
    "bad-answer",
    /** The caller's signal fired, or it stopped reading a stream. */
    "aborted",
  ),
  message: Schema.String,
});
export type ApiFailure = typeof ApiFailure.Type;

export type ApiResult<A, E> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E };

/** One of an API's own errors: `{ is, message }`. */
export const apiError = <const Is extends string>(is: Is) =>
  Schema.Struct({ is: Schema.Literal(is), message: Schema.String });

type AnySchema = Schema.Schema.AnyNoContext;

/** The most a request body may be, unless an operation says otherwise. */
export const defaultMaxBytes = 200_000;

/** A call: input in, an answer or an error out. */
export type CallOp<I extends AnySchema, O extends AnySchema, E extends AnySchema> = {
  readonly is: "call";
  readonly input: I;
  readonly output: O;
  readonly errors: E;
  readonly maxBytes: number;
};

/** A stream: input in, items out as they come, then the end (or an error). */
export type StreamOp<I extends AnySchema, T extends AnySchema, E extends AnySchema> = {
  readonly is: "stream";
  readonly input: I;
  readonly item: T;
  readonly errors: E;
  readonly maxBytes: number;
};

/** A link: a URL the browser loads itself (a download, an image). */
export type LinkOp<I extends AnySchema> = { readonly is: "link"; readonly input: I };

export type AnyOp =
  | CallOp<AnySchema, AnySchema, AnySchema>
  | StreamOp<AnySchema, AnySchema, AnySchema>
  | LinkOp<AnySchema>;

export const operation = <I extends AnySchema, O extends AnySchema, E extends AnySchema>(
  op: { readonly input: I; readonly output: O; readonly errors: E; readonly maxBytes?: number },
): CallOp<I, O, E> => ({
  is: "call",
  input: op.input,
  output: op.output,
  errors: op.errors,
  maxBytes: op.maxBytes ?? defaultMaxBytes,
});

export const stream = <I extends AnySchema, T extends AnySchema, E extends AnySchema>(
  op: { readonly input: I; readonly item: T; readonly errors: E; readonly maxBytes?: number },
): StreamOp<I, T, E> => ({
  is: "stream",
  input: op.input,
  item: op.item,
  errors: op.errors,
  maxBytes: op.maxBytes ?? defaultMaxBytes,
});

export const link = <I extends AnySchema>(op: { readonly input: I }): LinkOp<I> => ({
  is: "link",
  input: op.input,
});

export type ApiDefinition<Ops extends Readonly<Record<string, AnyOp>>> = {
  /** Lowercase letters, digits and single hyphens, e.g. "agent-runs". */
  readonly name: string;
  readonly server: ApiServer;
  readonly operations: Ops;
  /**
   * The outside services it sends data to, by name: a widget that uses it must list
   * each under its manifest's `permissions`.
   */
  readonly services: ReadonlyArray<string>;
};

// deno-lint-ignore no-explicit-any
export type AnyApi = ApiDefinition<Readonly<Record<string, any>>>;

export const defineApi = <const Ops extends Readonly<Record<string, AnyOp>>>(
  name: string,
  server: ApiServer,
  operations: Ops,
  options: { readonly services: ReadonlyArray<string> } = { services: [] },
): ApiDefinition<Ops> => ({ name, server, operations, services: options.services });

export type CallOptions = { readonly signal?: AbortSignal };

/** What calling a stream operation gives, at once. */
export type StreamCall<T, E> = {
  /** The items, as they come. Ends (never throws) when the stream ends, fails or is aborted. */
  readonly items: AsyncIterable<T>;
  /** How it ended. Settles once `items` is done with, or at once when the signal fires. */
  readonly result: Promise<ApiResult<null, E | ApiFailure>>;
};

type Type<S> = S extends Schema.Schema<infer A, infer _I, infer _R> ? A : never;

/** What a widget calls an operation as. */
export type ClientOp<Op> = Op extends CallOp<infer I, infer O, infer E>
  ? (input: Type<I>, options?: CallOptions) => Promise<ApiResult<Type<O>, Type<E> | ApiFailure>>
  : Op extends StreamOp<infer I, infer T, infer E>
    ? (input: Type<I>, options?: CallOptions) => StreamCall<Type<T>, Type<E>>
  : Op extends LinkOp<infer I> ? (input: Type<I>) => string
  : never;

/** The interface widgets code against: one method per operation. */
export type ApiClient<D extends AnyApi> = {
  readonly [K in keyof D["operations"]]: ClientOp<D["operations"][K]>;
};

/** Where an operation is, under a server's base URL. */
export const apiPath = (api: string, operation: string): string =>
  `${widgetApisPath}${encodeURIComponent(api)}/${encodeURIComponent(operation)}`;

const failure = (is: ApiFailure["is"], message: string) =>
  ({ ok: false, error: { is, message } }) as const;

/** The JSON body of a call or stream request, or why the input doesn't fit. */
export const requestBody = (
  op: CallOp<AnySchema, AnySchema, AnySchema> | StreamOp<AnySchema, AnySchema, AnySchema>,
  caller: Caller,
  input: unknown,
): ApiResult<string, ApiFailure> =>
  Either.match(Schema.encodeUnknownEither(op.input)(input), {
    onLeft: (e) => failure("bad-input", `That input doesn't fit: ${e.message}`),
    onRight: (encoded) => ({ ok: true, value: JSON.stringify({ caller, input: encoded }) }),
  });

/** A link operation's URL path and query, or why the input doesn't fit. */
export const linkPath = (
  api: string,
  operation: string,
  op: LinkOp<AnySchema>,
  caller: Caller,
  input: unknown,
): ApiResult<string, ApiFailure> =>
  Either.match(Schema.encodeUnknownEither(op.input)(input), {
    onLeft: (e) => failure("bad-input", `That input doesn't fit: ${e.message}`),
    onRight: (encoded) => ({
      ok: true,
      value: `${apiPath(api, operation)}?${new URLSearchParams({
        caller: JSON.stringify(caller),
        input: JSON.stringify(encoded),
      })}`,
    }),
  });

const parseJson = (text: string): Either.Either<unknown, string> =>
  Either.try({ try: (): unknown => JSON.parse(text), catch: () => "it isn't JSON" });

/** What a call's answer comes to. A status other than 200 is a failure, its body the reason. */
export const readCallAnswer = <Op extends CallOp<AnySchema, AnySchema, AnySchema>>(
  op: Op,
  status: number,
  body: string,
): ApiResult<Type<Op["output"]>, Type<Op["errors"]> | ApiFailure> => {
  if (status !== 200) return failure("failed", body.trim() || `The server answered ${status}.`);
  const answer = Either.flatMap(parseJson(body), (json) =>
    Either.mapLeft(
      Schema.decodeUnknownEither(Schema.Union(
        Schema.Struct({ ok: Schema.Literal(true), value: op.output }),
        Schema.Struct({ ok: Schema.Literal(false), error: op.errors }),
      ))(json),
      (e) => e.message,
    ));
  return Either.match(answer, {
    onLeft: (why) => failure("bad-answer", `The server's answer didn't fit: ${why}`),
    onRight: (decoded): ApiResult<Type<Op["output"]>, Type<Op["errors"]>> =>
      decoded.ok ? { ok: true, value: decoded.value } : { ok: false, error: decoded.error },
  });
};

/** One line of a stream's answer: an item, the end, or a line that doesn't fit. */
export type StreamLine<T, E> =
  | { readonly is: "item"; readonly item: T }
  | { readonly is: "end"; readonly result: ApiResult<null, E | ApiFailure> };

/** Reads one line of a stream's answer. */
export const readStreamLine = <Op extends StreamOp<AnySchema, AnySchema, AnySchema>>(
  op: Op,
  line: string,
): StreamLine<Type<Op["item"]>, Type<Op["errors"]>> => {
  const decoded = Either.flatMap(parseJson(line), (json) =>
    Either.mapLeft(
      Schema.decodeUnknownEither(Schema.Union(
        Schema.Struct({ item: op.item }),
        Schema.Struct({
          end: Schema.Union(
            Schema.Struct({ ok: Schema.Literal(true) }),
            Schema.Struct({
              ok: Schema.Literal(false),
              error: Schema.Union(op.errors, ApiFailure),
            }),
          ),
        }),
      ))(json),
      (e) => e.message,
    ));
  if (Either.isLeft(decoded)) {
    return {
      is: "end",
      result: failure("bad-answer", `The server's answer didn't fit: ${decoded.left}`),
    };
  }
  const value = decoded.right;
  if ("item" in value) return { is: "item", item: value.item };
  return {
    is: "end",
    result: value.end.ok ? { ok: true, value: null } : { ok: false, error: value.end.error },
  };
};

/** Splits text into whole lines, keeping a partial last line for the next chunk. */
export const splitLines = (
  pending: string,
  chunk: string,
): { readonly lines: ReadonlyArray<string>; readonly pending: string } => {
  const parts = (pending + chunk).split("\n");
  return { lines: parts.slice(0, -1).filter((l) => l.trim() !== ""), pending: parts.at(-1) ?? "" };
};

/** A request's body, as the server reads it. */
export const RequestBody = Schema.Struct({ caller: Caller, input: Schema.Unknown });
