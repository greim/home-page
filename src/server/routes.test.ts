import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import { defaultBackground, emptyLayout, type Layout, newColumn } from "../common/model.ts";
import {
  contentTypeFor,
  type HttpRequest,
  type HttpResponse,
  IoError,
  ServerIo,
  type Site,
} from "./http.ts";
import { handle, page } from "./routes.ts";

const site: Site = {
  hosts: new Set(["localhost:8443"]),
  assets: new Map([["main.js", {
    contentType: "text/javascript",
    body: new TextEncoder().encode("js"),
  }]]),
  buildId: "abc",
};

const request = (
  method: string,
  path: string,
  options: { body?: string; origin?: string; host?: string } = {},
): HttpRequest => ({
  method,
  url: new URL(path, `https://${options.host ?? "localhost:8443"}`),
  origin: options.origin ?? null,
  body: Effect.succeed(options.body ?? ""),
  bytes: Effect.succeed(new TextEncoder().encode(options.body ?? "")),
});

const unused = Effect.die("unexpected I/O");

const noIo = ServerIo.of({
  readLayoutFile: unused,
  writeLayoutTempFile: () => unused,
  commitLayoutTempFile: unused,
  listBackgroundFiles: unused,
  readBackgroundFile: () => unused,
  writeBackgroundFile: () => unused,
  fetchRemote: () => unused,
});

const run = (req: HttpRequest, io = noIo): Promise<HttpResponse> =>
  Effect.runPromise(handle(req, site).pipe(Effect.provideService(ServerIo, io)));

const layout: Layout = { version: 1, background: defaultBackground, columns: [newColumn("c")] };

Deno.test("/ redirects to the app", async () => {
  const res = await run(request("GET", "/"));
  assertEquals([res.status, res.headers["location"]], [302, "/web/app"]);
});

Deno.test("/web/app serves the page", async () => {
  for (const path of ["/web/app", "/web/app/"]) {
    const res = await run(request("GET", path));
    assertEquals(res.status, 200);
    assertEquals(res.body, page("abc"));
  }
  assertStringIncludes(page("abc"), `src="/web/assets/main.js?v=abc"`);
});

Deno.test("/web/assets serves known assets and 404s otherwise", async () => {
  const hit = await run(request("GET", "/web/assets/main.js"));
  assertEquals([hit.status, hit.headers["content-type"]], [200, "text/javascript"]);
  const miss = await run(request("GET", "/web/assets/nope.js"));
  assertEquals(miss.status, 404);
});

Deno.test("unknown paths and methods 404", async () => {
  assertEquals((await run(request("GET", "/elsewhere"))).status, 404);
  assertEquals((await run(request("POST", "/web/app"))).status, 404);
});

Deno.test("rejects unknown hosts (DNS rebinding)", async () => {
  const res = await run(request("GET", "/web/app", { host: "evil.test:8443" }));
  assertEquals(res.status, 421);
});

Deno.test("rejects cross-origin requests", async () => {
  const res = await run(
    request("PUT", "/api/layout", { origin: "https://evil.test" }),
  );
  assertEquals(res.status, 403);
  const same = await run(
    request("GET", "/", { origin: "https://localhost:8443" }),
  );
  assertEquals(same.status, 302);
});

Deno.test("GET /api/layout returns the stored layout", async () => {
  const res = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.succeed(JSON.stringify(layout)),
  });
  assertEquals([res.status, res.body], [200, JSON.stringify(layout)]);
});

Deno.test("GET /api/layout returns an empty layout when none is stored", async () => {
  const res = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.fail(
      new IoError({ cause: new Deno.errors.NotFound("gone") }),
    ),
  });
  assertEquals([res.status, res.body], [200, JSON.stringify(emptyLayout)]);
});

Deno.test("GET /api/layout reports read failures and corrupt data", async () => {
  const failed = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.fail(new IoError({ cause: "disk on fire" })),
  });
  assertEquals([failed.status, failed.body], [500, "disk on fire"]);
  const corrupt = await run(request("GET", "/api/layout"), {
    ...noIo,
    readLayoutFile: Effect.succeed(`{"version": 2}`),
  });
  assertEquals(corrupt.status, 500);
  assertStringIncludes(String(corrupt.body), "Stored layout is invalid");
});

Deno.test("PUT /api/layout validates, writes, then commits", async () => {
  const calls: Array<string> = [];
  const res = await run(
    request("PUT", "/api/layout", { body: JSON.stringify(layout) }),
    {
      ...noIo,
      writeLayoutTempFile: (text) => Effect.sync(() => void calls.push(`write ${text}`)),
      commitLayoutTempFile: Effect.sync(() => void calls.push("commit")),
    },
  );
  assertEquals(res.status, 204);
  assertEquals(calls, [`write ${JSON.stringify(layout, null, 2)}\n`, "commit"]);
});

Deno.test("PUT /api/layout rejects malformed JSON and invalid layouts", async () => {
  const notJson = await run(request("PUT", "/api/layout", { body: "{" }));
  assertEquals(notJson.status, 400);
  const invalid = await run(
    request("PUT", "/api/layout", { body: `{"version":1}` }),
  );
  assertEquals(invalid.status, 400);
});

Deno.test("/api/layout rejects other methods", async () => {
  const res = await run(request("DELETE", "/api/layout"));
  assertEquals((await run(request("DELETE", "/api/backgrounds"))).status, 405);
  assertEquals([res.status, res.headers["allow"]], [405, "GET, PUT"]);
});

Deno.test("contentTypeFor maps known extensions", () => {
  assertEquals(contentTypeFor("a.js"), "text/javascript; charset=utf-8");
  assertEquals(contentTypeFor("a.css"), "text/css; charset=utf-8");
  assertEquals(contentTypeFor("a.js.map"), "application/json; charset=utf-8");
  assertEquals(contentTypeFor("a.json"), "application/json; charset=utf-8");
  assertEquals(contentTypeFor("a.png"), "image/png");
  assertEquals(contentTypeFor("a.jpg"), "image/jpeg");
  assertEquals(contentTypeFor("a.JPEG"), "image/jpeg");
  assertEquals(contentTypeFor("a.gif"), "image/gif");
  assertEquals(contentTypeFor("a.avif"), "image/avif");
  assertEquals(contentTypeFor("a.webp"), "image/webp");
  assertEquals(contentTypeFor("a.svg"), "image/svg+xml");
  assertEquals(contentTypeFor("a.bin"), "application/octet-stream");
});
