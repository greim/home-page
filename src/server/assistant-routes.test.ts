import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Stream } from "effect";
import type { Answer, LoggedEvent, SendMessage } from "../common/assistant.ts";
import type { Assistant, SendResult } from "./assistant.ts";
import { AssistantService, handleAssistant } from "./assistant-routes.ts";
import { type HttpRequest, type HttpResponse, IoError } from "./http.ts";

const site = {
  hosts: new Set(["localhost:9443"]),
  appOrigins: new Set(["https://localhost:8443"]),
};

const fake = (overrides: Partial<Assistant> = {}) => {
  const sent: Array<SendMessage> = [];
  const answers: Array<[string, Answer]> = [];
  const assistant: Assistant = {
    send: (m) =>
      Effect.sync((): SendResult => {
        sent.push(m);
        return { ok: true, log: "L", after: 4 };
      }),
    answer: (id, a) => Effect.sync(() => (answers.push([id, a]), id === "r1")),
    events: (log, after) =>
      log === "L"
        ? Stream.fromIterable<LoggedEvent>([
          { seq: after + 1, event: { is: "text", text: "hi" }, transient: false, sessionId: null },
          {
            seq: after + 2,
            event: { is: "done", costUsd: null, durationMs: 1 },
            transient: false,
            sessionId: null,
          },
        ])
        : null,
    state: Effect.succeed({ log: "L", latest: 12 }),
    interrupt: Effect.succeed(true),
    setModel: () => Effect.void,
    capabilities: Effect.succeed({ commands: [], models: [] }),
    setMode: () => Effect.void,
    sessions: Effect.succeed([{ sessionId: "s1", title: "Fix bug", lastModified: 3 }]),
    history: (id) =>
      id === "s 1"
        ? Effect.succeed([{ is: "user", text: "Hi" }])
        : Effect.fail(new IoError({ cause: "no such session" })),
    ...overrides,
  };
  return { sent, answers, assistant };
};

const request = (
  method: string,
  path: string,
  options: { body?: string; origin?: string | null; host?: string } = {},
): HttpRequest => ({
  method,
  url: new URL(`https://${options.host ?? "localhost:9443"}${path}`),
  origin: options.origin === undefined ? "https://localhost:8443" : options.origin,
  body: Effect.succeed(options.body ?? ""),
});

const handle = (req: HttpRequest, assistant: Assistant) =>
  Effect.runPromise(
    handleAssistant(req, site).pipe(Effect.provideService(AssistantService, assistant)),
  );

const bodyText = async (response: HttpResponse) =>
  response.body instanceof ReadableStream
    ? await new Response(response.body).text()
    : String(response.body);

Deno.test("only the app's own origins, and requests from no page at all, are answered", async () => {
  const { assistant } = fake();
  const evil = await handle(
    request("GET", "/api/assistant/health", { origin: "https://evil.test" }),
    assistant,
  );
  assertEquals(evil.status, 403);
  const app = await handle(request("GET", "/api/assistant/health"), assistant);
  assertEquals(app.status, 200);
  assertEquals(app.headers["access-control-allow-origin"], "https://localhost:8443");
  const curl = await handle(request("GET", "/api/assistant/health", { origin: null }), assistant);
  assertEquals(curl.status, 200);
  assertEquals(curl.headers["access-control-allow-origin"], undefined);
});

Deno.test("requests for other hosts are refused (DNS rebinding)", async () => {
  const { assistant } = fake();
  const res = await handle(
    request("GET", "/api/assistant/health", { host: "evil.test:9443" }),
    assistant,
  );
  assertEquals(res.status, 421);
});

Deno.test("preflight requests are allowed for the app", async () => {
  const res = await handle(request("OPTIONS", "/api/assistant/messages"), fake().assistant);
  assertEquals(res.status, 204);
  assertEquals(res.headers["access-control-allow-headers"], "content-type");
  assertEquals(res.headers["access-control-allow-origin"], "https://localhost:8443");
});

Deno.test("a message starts a turn, saying where its events start", async () => {
  const { sent, assistant } = fake();
  const res = await handle(
    request("POST", "/api/assistant/messages", {
      body: JSON.stringify({ message: "Hi", sessionId: null, screenshot: null }),
    }),
    assistant,
  );
  assertEquals(res.status, 202);
  assertEquals(JSON.parse(await bodyText(res)), { log: "L", after: 4 });
  // A message sent without images has none.
  assertEquals(sent, [{ message: "Hi", sessionId: null, screenshot: null, images: [] }]);
});

Deno.test("a message is refused while another turn runs, or when it's malformed", async () => {
  const busy = fake({ send: () => Effect.succeed({ ok: false }) }).assistant;
  const body = JSON.stringify({ message: "Hi", sessionId: null, screenshot: null });
  assertEquals(
    (await handle(request("POST", "/api/assistant/messages", { body }), busy)).status,
    409,
  );
  const bad = await handle(
    request("POST", "/api/assistant/messages", { body: "{}" }),
    fake().assistant,
  );
  assertEquals(bad.status, 400);
  const get = await handle(request("GET", "/api/assistant/messages"), fake().assistant);
  assertEquals(get.status, 405);
});

Deno.test("an unreadable body counts as malformed", async () => {
  const req = {
    ...request("POST", "/api/assistant/messages"),
    body: Effect.fail(new IoError({ cause: "x" })),
  };
  assertEquals((await handle(req, fake().assistant)).status, 400);
});

Deno.test("the event log streams as NDJSON from the given point", async () => {
  const res = await handle(request("GET", "/api/assistant/events?log=L&after=7"), fake().assistant);
  assertEquals(res.status, 200);
  assertEquals(res.headers["content-type"], "application/x-ndjson; charset=utf-8");
  const lines = (await bodyText(res)).trim().split("\n").map((l) => JSON.parse(l));
  assertEquals(lines.map((l) => l.seq), [8, 9]);
});

Deno.test("an earlier run's log is gone; a bad position is refused", async () => {
  const gone = await handle(
    request("GET", "/api/assistant/events?log=old&after=1"),
    fake().assistant,
  );
  assertEquals(gone.status, 410);
  assertStringIncludes(await bodyText(gone), "restarted");
  const bad = await handle(
    request("GET", "/api/assistant/events?log=L&after=-1"),
    fake().assistant,
  );
  assertEquals(bad.status, 400);
  assertEquals(
    (await handle(request("POST", "/api/assistant/events"), fake().assistant)).status,
    405,
  );
});

Deno.test("answers reach what's waiting, or 404", async () => {
  const { answers, assistant } = fake();
  const body = JSON.stringify({ is: "permission", choice: "allow" });
  const ok = await handle(request("POST", "/api/assistant/answers/r1", { body }), assistant);
  assertEquals(ok.status, 204);
  const missing = await handle(request("POST", "/api/assistant/answers/r2", { body }), assistant);
  assertEquals(missing.status, 404);
  assertEquals(answers, [["r1", { is: "permission", choice: "allow" }], ["r2", {
    is: "permission",
    choice: "allow",
  }]]);
  const bad = await handle(request("POST", "/api/assistant/answers/r1", { body: "{}" }), assistant);
  assertEquals(bad.status, 400);
  assertEquals((await handle(request("GET", "/api/assistant/answers/r1"), assistant)).status, 405);
});

Deno.test("anything else is not found; health only answers GET", async () => {
  assertEquals((await handle(request("GET", "/nope"), fake().assistant)).status, 404);
  assertEquals(
    (await handle(request("POST", "/api/assistant/health"), fake().assistant)).status,
    405,
  );
});

Deno.test("a running turn can be stopped; 409 when there's none", async () => {
  assertEquals(
    (await handle(request("POST", "/api/assistant/interrupt"), fake().assistant)).status,
    204,
  );
  const idle = fake({ interrupt: Effect.succeed(false) }).assistant;
  assertEquals((await handle(request("POST", "/api/assistant/interrupt"), idle)).status, 409);
  const broken = fake({ interrupt: Effect.fail(new IoError({ cause: "sdk" })) }).assistant;
  assertEquals((await handle(request("POST", "/api/assistant/interrupt"), broken)).status, 500);
  assertEquals((await handle(request("GET", "/api/assistant/interrupt"), idle)).status, 405);
});

Deno.test("a conversation's mode is set", async () => {
  const body = JSON.stringify({ mode: "plan", sessionId: null });
  const set: Array<[string, string | null]> = [];
  const recording = fake({ setMode: (mode, id) => Effect.sync(() => void set.push([mode, id])) });
  assertEquals(
    (await handle(request("POST", "/api/assistant/mode", { body }), recording.assistant)).status,
    204,
  );
  assertEquals(set, [["plan", null]]);
  const none = fake().assistant;
  const bad = JSON.stringify({ mode: "yolo", sessionId: null });
  assertEquals(
    (await handle(request("POST", "/api/assistant/mode", { body: bad }), none)).status,
    400,
  );
  const broken = fake({ setMode: () => Effect.fail(new IoError({ cause: "sdk" })) }).assistant;
  assertEquals(
    (await handle(request("POST", "/api/assistant/mode", { body }), broken)).status,
    500,
  );
  assertEquals((await handle(request("GET", "/api/assistant/mode"), none)).status, 405);
});

Deno.test("past sessions are listed, and one is given as events", async () => {
  const list = await handle(request("GET", "/api/assistant/sessions"), fake().assistant);
  assertEquals(JSON.parse(await bodyText(list)), {
    sessions: [{ sessionId: "s1", title: "Fix bug", lastModified: 3 }],
  });
  const one = await handle(request("GET", "/api/assistant/sessions/s%201"), fake().assistant);
  assertEquals(JSON.parse(await bodyText(one)), { events: [{ is: "user", text: "Hi" }] });
  const missing = await handle(request("GET", "/api/assistant/sessions/nope"), fake().assistant);
  assertEquals(missing.status, 500);
  const broken = fake({ sessions: Effect.fail(new IoError({ cause: "sdk" })) }).assistant;
  assertEquals((await handle(request("GET", "/api/assistant/sessions"), broken)).status, 500);
  assertEquals((await handle(request("POST", "/api/assistant/sessions"), broken)).status, 405);
  assertEquals((await handle(request("POST", "/api/assistant/sessions/x"), broken)).status, 405);
});

Deno.test("the state says which log is kept, and its last event's number", async () => {
  const res = await handle(request("GET", "/api/assistant/state"), fake().assistant);
  assertEquals(JSON.parse(await bodyText(res)), { log: "L", latest: 12 });
  assertEquals(
    (await handle(request("POST", "/api/assistant/state"), fake().assistant)).status,
    405,
  );
});

Deno.test("the model is set; capabilities are listed", async () => {
  const body = JSON.stringify({ model: "opus" });
  assertEquals(
    (await handle(request("POST", "/api/assistant/model", { body }), fake().assistant)).status,
    204,
  );
  const bad = await handle(
    request("POST", "/api/assistant/model", { body: "{}" }),
    fake().assistant,
  );
  assertEquals(bad.status, 400);
  const broken = fake({ setModel: () => Effect.fail(new IoError({ cause: "sdk" })) }).assistant;
  assertEquals(
    (await handle(request("POST", "/api/assistant/model", { body }), broken)).status,
    500,
  );
  assertEquals((await handle(request("GET", "/api/assistant/model"), broken)).status, 405);
  const caps = await handle(request("GET", "/api/assistant/capabilities"), fake().assistant);
  assertEquals(JSON.parse(await bodyText(caps)), { commands: [], models: [] });
  const noCaps = fake({ capabilities: Effect.fail(new IoError({ cause: "sdk" })) }).assistant;
  assertEquals((await handle(request("GET", "/api/assistant/capabilities"), noCaps)).status, 500);
  assertEquals(
    (await handle(request("POST", "/api/assistant/capabilities"), noCaps)).status,
    405,
  );
});
