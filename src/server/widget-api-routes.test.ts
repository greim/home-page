import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Schema, Stream } from "effect";
import { apiError, defineApi, link, operation, stream } from "../common/widget-apis.ts";
import { type HttpRequest, type HttpResponse, text } from "./http.ts";
import { HandlerFailed, handleWidgetApis, isWidgetApiRequest, serve } from "./widget-api-routes.ts";

const NoMatch = apiError("no-match");

const api = defineApi("test", "main", {
  find: operation({
    input: Schema.Struct({ query: Schema.String }),
    output: Schema.Struct({ count: Schema.NumberFromString }),
    errors: NoMatch,
    maxBytes: 100,
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
    query === "boom"
      ? Effect.fail(new HandlerFailed({ message: "The disk is gone" }))
      : query === "none"
      ? Effect.succeed({ ok: false, error: { is: "no-match", message: "No match" } } as const)
      : Effect.succeed({ ok: true, value: { count: caller.widgetId.length } } as const),
  count: ({ to }) =>
    Effect.succeed(
      to < 0
        ? { ok: false, error: { is: "no-match", message: "Nothing to count" } } as const
        : { ok: true, value: Stream.range(1, to) } as const,
    ),
  file: ({ name }, caller) => Effect.succeed(text(200, `${caller.widgetType}:${name}`)),
});

const caller = { widgetType: "t", widgetId: "w1" };

const request = (method: string, path: string, body = ""): HttpRequest => ({
  method,
  url: new URL(`https://localhost${path}`),
  origin: null,
  body: Effect.succeed(body),
});

const handle = (req: HttpRequest) => Effect.runPromise(handleWidgetApis(req, [served]));

const post = (operation: string, input: unknown) =>
  handle(request("POST", `/api/widget-apis/test/${operation}`, JSON.stringify({ caller, input })));

const bodyText = (response: HttpResponse) =>
  response.body instanceof ReadableStream
    ? new Response(response.body).text()
    : Promise.resolve(String(response.body));

Deno.test("requests under /api/widget-apis/ are widget API requests", () => {
  assertEquals(isWidgetApiRequest(request("GET", "/api/widget-apis/x/y")), true);
  assertEquals(isWidgetApiRequest(request("GET", "/api/layout")), false);
});

Deno.test("a call is answered with its encoded value, or its own error", async () => {
  const found = await post("find", { query: "x" });
  assertEquals([found.status, await bodyText(found)], [200, '{"ok":true,"value":{"count":"2"}}']);
  const none = await post("find", { query: "none" });
  assertEquals(
    await bodyText(none),
    '{"ok":false,"error":{"is":"no-match","message":"No match"}}',
  );
});

Deno.test("a handler's failure is a 500 that says why", async () => {
  const boom = await post("find", { query: "boom" });
  assertEquals([boom.status, await bodyText(boom)], [500, "The disk is gone"]);
});

Deno.test("a stream is NDJSON: its items, then its end", async () => {
  const counted = await post("count", { to: 2 });
  assertEquals(counted.headers["content-type"], "application/x-ndjson; charset=utf-8");
  assertEquals(await bodyText(counted), '{"item":"1"}\n{"item":"2"}\n{"end":{"ok":true}}\n');
  assertEquals(
    await bodyText(await post("count", { to: -1 })),
    '{"end":{"ok":false,"error":{"is":"no-match","message":"Nothing to count"}}}\n',
  );
});

Deno.test("a link is a GET, with its caller and input in the query", async () => {
  const query = new URLSearchParams({
    caller: JSON.stringify(caller),
    input: JSON.stringify({ name: "a.csv" }),
  });
  const got = await handle(request("GET", `/api/widget-apis/test/file?${query}`));
  assertEquals(await bodyText(got), "t:a.csv");
  assertEquals((await handle(request("GET", "/api/widget-apis/test/file?input=1"))).status, 400);
  assertEquals((await handle(request("POST", `/api/widget-apis/test/file?${query}`))).status, 405);
});

Deno.test("bad requests are refused: unknown, wrong method, malformed, misfit or too big", async () => {
  const status = async (req: HttpRequest) => (await handle(req)).status;
  assertEquals(await status(request("POST", "/api/widget-apis/nope/find")), 404);
  assertEquals(await status(request("POST", "/api/widget-apis/test/nope")), 404);
  assertEquals(await status(request("POST", "/api/widget-apis/test/find/more")), 404);
  assertEquals(await status(request("GET", "/api/widget-apis/test/find")), 405);
  assertEquals(await status(request("POST", "/api/widget-apis/test/find", "nope")), 400);
  assertEquals(
    await status(request("POST", "/api/widget-apis/test/find", JSON.stringify({ input: {} }))),
    400,
  );
  const misfit = await post("find", { query: 1 });
  assertEquals(misfit.status, 400);
  const big = await post("find", { query: "x".repeat(100) });
  assertStringIncludes(await bodyText(big), "too much");
});
