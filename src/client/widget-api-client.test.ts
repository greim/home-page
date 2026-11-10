import { assertEquals } from "@std/assert";
import { Effect, Schema, Stream } from "effect";
import { apiError, defineApi, link, operation, stream } from "../common/widget-apis.ts";
import type { HttpResponse } from "../server/http.ts";
import { text } from "../server/http.ts";
import { handleWidgetApis, serve } from "../server/widget-api-routes.ts";
import { apiBase, type Fetch, makeApiClient } from "./widget-api-client.ts";

const NoMatch = apiError("no-match");

const api = defineApi("test", "main", {
  find: operation({
    input: Schema.Struct({ query: Schema.String }),
    output: Schema.Struct({ who: Schema.String }),
    errors: NoMatch,
  }),
  count: stream({
    input: Schema.Struct({ to: Schema.Number }),
    item: Schema.NumberFromString,
    errors: NoMatch,
  }),
  file: link({ input: Schema.Struct({ name: Schema.String }) }),
});

const served = serve(api, {
  find: ({ query }, caller) =>
    Effect.succeed(
      query === "none"
        ? { ok: false, error: { is: "no-match", message: "No match" } } as const
        : { ok: true, value: { who: `${caller.widgetType}/${caller.widgetId}` } } as const,
    ),
  count: ({ to }) =>
    Effect.succeed(
      to < 0
        ? { ok: false, error: { is: "no-match", message: "Nothing" } } as const
        : { ok: true, value: Stream.range(1, to) } as const,
    ),
  file: () => Effect.succeed(text(200, "")),
});

/** A fetch that's answered by the server's dispatcher, as the real server would. */
const serverFetch: Fetch = async (url, init) => {
  const response: HttpResponse = await Effect.runPromise(handleWidgetApis({
    method: init.method ?? "GET",
    url: new URL(url, "https://localhost"),
    origin: null,
    body: Effect.succeed(String(init.body ?? "")),
  }, [served]));
  return new Response(response.body, { status: response.status, headers: response.headers });
};

const caller = { widgetType: "t", widgetId: "w1" };
const client = makeApiClient(api, "", caller, serverFetch);

const collect = async <T>(items: AsyncIterable<T>) => {
  const all: Array<T> = [];
  for await (const item of items) all.push(item);
  return all;
};

Deno.test("a call goes to the server with the page's caller, and decodes the answer", async () => {
  assertEquals(await client.find({ query: "x" }), { ok: true, value: { who: "t/w1" } });
  assertEquals(await client.find({ query: "none" }), {
    ok: false,
    error: { is: "no-match", message: "No match" },
  });
});

Deno.test("a call that can't reach the server, or is stopped, says so", async () => {
  const down = makeApiClient(api, "", caller, () => Promise.reject(new TypeError("offline")));
  const result = await down.find({ query: "x" });
  assertEquals(result.ok ? "" : result.error.is, "unreachable");
  const stopped = new AbortController();
  stopped.abort();
  const aborted = await makeApiClient(
    api,
    "",
    caller,
    (_url, init) =>
      init.signal?.aborted === true
        ? Promise.reject(new DOMException("aborted", "AbortError"))
        : serverFetch(_url, init),
  ).find({ query: "x" }, { signal: stopped.signal });
  assertEquals(aborted.ok ? "" : aborted.error.is, "aborted");
});

Deno.test("a stream's items come as they're read, then its result", async () => {
  const { items, result } = client.count({ to: 3 });
  assertEquals(await collect(items), [1, 2, 3]);
  assertEquals(await result, { ok: true, value: null });
  const refused = client.count({ to: -1 });
  assertEquals(await collect(refused.items), []);
  assertEquals(await refused.result, { ok: false, error: { is: "no-match", message: "Nothing" } });
});

Deno.test("breaking out of a stream stops it, and its result says so", async () => {
  const { items, result } = client.count({ to: 100 });
  const seen: Array<number> = [];
  for await (const n of items) {
    seen.push(n);
    if (n === 2) break;
  }
  assertEquals(seen, [1, 2]);
  assertEquals((await result).ok ? "" : "aborted", "aborted");
});

Deno.test("the signal settles a stream's result at once, read or not", async () => {
  const stop = new AbortController();
  const { result } = client.count({ to: 3 }, { signal: stop.signal });
  stop.abort();
  const ended = await result;
  assertEquals(ended.ok ? "" : ended.error.is, "aborted");
});

Deno.test("a stream cut off before its end is a failure", async () => {
  const cut = makeApiClient(
    api,
    "",
    caller,
    () => Promise.resolve(new Response('{"item":"1"}\n{"item":"2"}\n', { status: 200 })),
  );
  const { items, result } = cut.count({ to: 3 });
  assertEquals(await collect(items), [1, 2]);
  const ended = await result;
  assertEquals(ended.ok ? "" : ended.error.is, "failed");
});

Deno.test("a stream the server refuses outright says why", async () => {
  const refusing = makeApiClient(
    api,
    "",
    caller,
    () => Promise.resolve(new Response("That's too much", { status: 400 })),
  );
  const { items, result } = refusing.count({ to: 3 });
  assertEquals(await collect(items), []);
  assertEquals(await result, { ok: false, error: { is: "failed", message: "That's too much" } });
});

Deno.test("a link is a URL at the API's server, with the caller and input", () => {
  const url = new URL(
    makeApiClient(api, "https://localhost:9443", caller, serverFetch).file({ name: "a.csv" }),
  );
  assertEquals(url.origin + url.pathname, "https://localhost:9443/api/widget-apis/test/file");
  assertEquals(JSON.parse(url.searchParams.get("input") ?? ""), { name: "a.csv" });
});

Deno.test("an API's server is the page's own, or the assistant service on the page's host", () => {
  const page = { protocol: "https:", hostname: "localhost" };
  assertEquals(apiBase("main", page, "9443"), "");
  assertEquals(apiBase("assistant", page, "9443"), "https://localhost:9443");
});
