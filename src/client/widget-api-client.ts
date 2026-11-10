/**
 * The page's client for a widget API (src/common/widget-apis.ts): one object, built
 * for one widget, with a method per operation, that encodes the input, makes the
 * request, and decodes the answer. Calls never reject. The page gives a widget's
 * views one per API its manifest declares (see widget-apis-live.ts).
 */
import {
  type AnyApi,
  type AnyOp,
  type ApiClient,
  type ApiFailure,
  apiPath,
  type ApiResult,
  type ApiServer,
  type Caller,
  type CallOptions,
  linkPath,
  readCallAnswer,
  readStreamLine,
  requestBody,
  splitLines,
  type StreamCall,
} from "../common/widget-apis.ts";

/** Where a server's APIs are: the page's own origin, or the assistant service's port on its host. */
export const apiBase = (
  server: ApiServer,
  page: { readonly protocol: string; readonly hostname: string },
  assistantPort: string,
): string => {
  switch (server) {
    case "main":
      return "";
    case "assistant":
      return `${page.protocol}//${page.hostname}:${assistantPort}`;
    default:
      return server satisfies never;
  }
};

/** The `fetch` the client uses: the browser's, or a test's. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const failed = (is: ApiFailure["is"], message: string) =>
  ({ ok: false, error: { is, message } }) as const;

const aborted = failed("aborted", "It was stopped.");

const unreachable = (cause: unknown) =>
  failed("unreachable", `Couldn't reach the server: ${String(cause)}`);

const post = (fetchFn: Fetch, url: string, body: string, signal: AbortSignal | undefined) =>
  fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    ...(signal === undefined ? {} : { signal }),
  }).then(
    (response) => ({ ok: true, response }) as const,
    (cause) => ({ ok: false, cause }) as const,
  );

const callOp = (
  fetchFn: Fetch,
  url: string,
  op: Extract<AnyOp, { is: "call" }>,
  caller: Caller,
) =>
async (input: unknown, options: CallOptions = {}): Promise<ApiResult<unknown, unknown>> => {
  const body = requestBody(op, caller, input);
  if (!body.ok) return body;
  const sent = await post(fetchFn, url, body.value, options.signal);
  if (!sent.ok) return options.signal?.aborted === true ? aborted : unreachable(sent.cause);
  const text = await sent.response.text().then((t) => t, () => null);
  if (text === null) return options.signal?.aborted === true ? aborted : unreachable("lost");
  return readCallAnswer(op, sent.response.status, text);
};

const streamOp = (
  fetchFn: Fetch,
  url: string,
  op: Extract<AnyOp, { is: "stream" }>,
  caller: Caller,
) =>
(input: unknown, options: CallOptions = {}): StreamCall<unknown, unknown> => {
  // Stopped by the caller's signal, or by the reader breaking out of its loop.
  const stop = new AbortController();
  const signal = options.signal === undefined
    ? stop.signal
    : AbortSignal.any([options.signal, stop.signal]);
  let settle: (result: ApiResult<null, unknown>) => void = () => {};
  const result = new Promise<ApiResult<null, unknown>>((resolve) => {
    let settled = false;
    settle = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
  });
  // The caller's signal settles the result at once, whether or not `items` is being read.
  options.signal?.addEventListener("abort", () => settle(aborted), { once: true });

  const body = requestBody(op, caller, input);
  const sending = body.ok ? post(fetchFn, url, body.value, signal) : null;

  async function* items(): AsyncGenerator<unknown, void, undefined> {
    if (!body.ok || sending === null) return settle(body.ok ? aborted : body);
    try {
      const sent = await sending;
      if (!sent.ok) return settle(signal.aborted ? aborted : unreachable(sent.cause));
      const { response } = sent;
      if (response.status !== 200 || response.body === null) {
        const text = await response.text().then((t) => t, () => "");
        return settle(failed("failed", text.trim() || `The server answered ${response.status}.`));
      }
      let pending = "";
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const read = await reader.read().then((r) => r, () => null);
        if (read === null) {
          return settle(signal.aborted ? aborted : unreachable("the connection was lost"));
        }
        if (read.done) {
          return settle(failed("failed", "The stream ended before saying how it went."));
        }
        const split = splitLines(pending, read.value);
        pending = split.pending;
        for (const line of split.lines) {
          const read = readStreamLine(op, line);
          if (read.is === "end") {
            void reader.cancel().catch(() => {});
            return settle(read.result);
          }
          yield read.item;
        }
      }
    } finally {
      // Broken out of, or finished: either way, the request is done with.
      settle(aborted);
      stop.abort();
    }
  }

  return { items: items(), result };
};

/** A client for `api`, for the widget `caller`, at the server whose base URL is `base`. */
export const makeApiClient = <D extends AnyApi>(
  api: D,
  base: string,
  caller: Caller,
  fetchFn: Fetch,
): ApiClient<D> =>
  Object.fromEntries(
    Object.entries(api.operations as Readonly<Record<string, AnyOp>>).map(([name, op]) => {
      const url = `${base}${apiPath(api.name, name)}`;
      switch (op.is) {
        case "call":
          return [name, callOp(fetchFn, url, op, caller)];
        case "stream":
          return [name, streamOp(fetchFn, url, op, caller)];
        case "link":
          return [name, (input: unknown) => {
            const path = linkPath(api.name, name, op, caller, input);
            return path.ok ? `${base}${path.value}` : "";
          }];
        default:
          return op satisfies never;
      }
    }),
  ) as ApiClient<D>;
