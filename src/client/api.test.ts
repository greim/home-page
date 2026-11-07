import { assertEquals } from "@std/assert";
import { Effect, Either, Stream } from "effect";
import type { ChatEvent, LoggedEvent } from "../common/assistant.ts";
import { emptyLayout } from "../common/model.ts";
import {
  answerAssistant,
  ApiError,
  assistantBase,
  assistantState,
  followAssistant,
  Http,
  type HttpResult,
  interruptAssistant,
  listAssistantSessions,
  loadAssistantSession,
  loadLayout,
  saveLayout,
  sendToAssistant,
  setAssistantMode,
} from "./api.ts";

const noStream = () => Effect.die("unexpected stream");

const respond = (result: HttpResult) =>
  Http.of({ request: () => Effect.succeed(result), stream: noStream });

const run = <A>(effect: Effect.Effect<A, ApiError, Http>, http: Http["Type"]) =>
  Effect.runSync(
    Effect.either(Effect.provideService(effect, Http, http)).pipe(
      Effect.map(Either.mapLeft((e) => e.message)),
    ),
  );

Deno.test("loadLayout decodes the server's layout", () => {
  const http = respond({ status: 200, text: JSON.stringify(emptyLayout) });
  assertEquals(run(loadLayout, http), Either.right(emptyLayout));
});

Deno.test("loadLayout fails on error statuses", () => {
  const http = respond({ status: 500, text: "boom" });
  assertEquals(
    run(loadLayout, http),
    Either.left("Server responded 500: boom"),
  );
});

Deno.test("loadLayout fails on malformed or invalid JSON", () => {
  for (const text of ["{", `{"version":3}`]) {
    const result = run(loadLayout, respond({ status: 200, text }));
    assertEquals(Either.isLeft(result), true);
  }
});

Deno.test("loadLayout passes through network failures", () => {
  const error = new ApiError({ message: "offline" });
  const http = Http.of({ request: () => Effect.fail(error), stream: noStream });
  assertEquals(run(loadLayout, http), Either.left("offline"));
});

Deno.test("saveLayout PUTs the layout as JSON", () => {
  const sent: Array<unknown> = [];
  const http = Http.of({
    request: (method, path, body, contentType) =>
      Effect.sync(() => {
        sent.push([method, path, body, contentType]);
        return { status: 204, text: "" };
      }),
    stream: noStream,
  });
  assertEquals(run(saveLayout(emptyLayout), http), Either.right(undefined));
  assertEquals(sent, [["PUT", "/api/layout", JSON.stringify(emptyLayout), "application/json"]]);
});

Deno.test("saveLayout fails on rejection", () => {
  const result = run(saveLayout(emptyLayout), respond({ status: 400, text: "bad" }));
  assertEquals(result, Either.left("Server responded 400: bad"));
});

Deno.test("the assistant service is on its own port, on the page's host", () => {
  assertEquals(
    assistantBase({ protocol: "https:", hostname: "127.0.0.1" }, "9443"),
    "https://127.0.0.1:9443/api/assistant",
  );
});

const base = "https://localhost:9443/api/assistant";

/** Records requests, answering each with `result`. */
const recording = (result: HttpResult) => {
  const sent: Array<unknown> = [];
  const http = Http.of({
    request: (method, path, body) =>
      Effect.sync(() => {
        sent.push([method, path, typeof body === "string" ? JSON.parse(body) : body]);
        return result;
      }),
    stream: noStream,
  });
  return { sent, http };
};

Deno.test("sendToAssistant posts the message and says where its turn's events start", () => {
  const { sent, http } = recording({ status: 202, text: `{"log":"L","after":4}` });
  const result = run(
    sendToAssistant(base, {
      message: "Hi",
      sessionId: "s1",
      screenshot: new Uint8Array([1, 2, 3]),
      images: [{ mediaType: "image/png", data: new Uint8Array([4]) }],
    }),
    http,
  );
  assertEquals(result, Either.right({ log: "L", after: 4 }));
  assertEquals(sent, [["POST", `${base}/messages`, {
    message: "Hi",
    sessionId: "s1",
    screenshot: "AQID",
    images: [{ mediaType: "image/png", data: "BA==" }],
  }]]);
});

Deno.test("sendToAssistant fails while the assistant is busy, and won't send an empty message", () => {
  const busy = recording({ status: 409, text: "still working" });
  assertEquals(
    run(
      sendToAssistant(base, { message: "Hi", sessionId: null, screenshot: null, images: [] }),
      busy.http,
    ),
    Either.left("Server responded 409: still working"),
  );
  const empty = recording({ status: 202, text: "" });
  const result = run(
    sendToAssistant(base, { message: "", sessionId: null, screenshot: null, images: [] }),
    empty.http,
  );
  assertEquals(Either.isLeft(result), true);
  assertEquals(empty.sent, []);
});

Deno.test("answerAssistant posts the answer for the request", () => {
  const { sent, http } = recording({ status: 204, text: "" });
  assertEquals(
    run(answerAssistant(base, "r 1", { is: "permission", choice: "always" }), http),
    Either.right(undefined),
  );
  assertEquals(sent, [["POST", `${base}/answers/r%201`, { is: "permission", choice: "always" }]]);
  const gone = recording({ status: 404, text: "Nothing is waiting" });
  assertEquals(
    run(answerAssistant(base, "r1", { is: "permission", choice: "allow" }), gone.http),
    Either.left("Server responded 404: Nothing is waiting"),
  );
});

const streaming = (status: number, chunks: ReadonlyArray<string>) => {
  const urls: Array<string> = [];
  const http = Http.of({
    request: () => Effect.die("unexpected request"),
    stream: (url) =>
      Effect.sync(() => {
        urls.push(url);
        return { status, chunks: Stream.fromIterable(chunks) };
      }),
  });
  return { urls, http };
};

const line = (logged: LoggedEvent) => JSON.stringify(logged) + "\n";

Deno.test("followAssistant hands over each event as it arrives, until the turn is done", () => {
  const events: Array<LoggedEvent> = [];
  const hi: LoggedEvent = {
    seq: 5,
    event: { is: "text", text: "Hi" },
    transient: false,
    sessionId: "s1",
  };
  const done: LoggedEvent = {
    seq: 6,
    event: { is: "done", costUsd: null, durationMs: 5 },
    transient: false,
    sessionId: null,
  };
  const { urls, http } = streaming(200, [
    line(hi).slice(0, 10),
    line(hi).slice(10),
    // Sent without `transient` and `sessionId`, which then default to false and null.
    JSON.stringify({ seq: 6, event: done.event }) + "\n",
    // Never read: the turn ended.
    line({ seq: 7, event: { is: "text", text: "next turn" }, transient: false, sessionId: null }),
  ]);
  assertEquals(
    run(followAssistant(base, "L", 4, (e) => events.push(e)), http),
    Either.right(undefined),
  );
  assertEquals(urls, [`${base}/events?log=L&after=4`]);
  assertEquals(events, [hi, done]);
});

Deno.test("followAssistant fails on error statuses and malformed events", () => {
  const gone = streaming(410, ["The assistant ", "service restarted"]);
  assertEquals(
    run(followAssistant(base, "old", 1, () => {}), gone.http),
    Either.left("The assistant responded 410: The assistant service restarted"),
  );
  const garbled = streaming(200, [`{"seq":1,"event":{"is":"nope"}}\n`]);
  assertEquals(Either.isLeft(run(followAssistant(base, "L", 0, () => {}), garbled.http)), true);
});

Deno.test("interrupting and setting the mode post to the service", () => {
  const { sent, http } = recording({ status: 204, text: "" });
  assertEquals(run(interruptAssistant(base), http), Either.right(undefined));
  assertEquals(run(setAssistantMode(base, "plan", "s1"), http), Either.right(undefined));
  assertEquals(sent, [["POST", `${base}/interrupt`, null], ["POST", `${base}/mode`, {
    mode: "plan",
    sessionId: "s1",
  }]]);
  const idle = recording({ status: 409, text: "not working" });
  assertEquals(
    run(interruptAssistant(base), idle.http),
    Either.left("Server responded 409: not working"),
  );
});

Deno.test("past conversations are listed, and one loads as events", () => {
  const sessions = [{ sessionId: "s1", title: "Fix bug", lastModified: 5 }];
  const listed = recording({ status: 200, text: JSON.stringify({ sessions }) });
  assertEquals(run(listAssistantSessions(base), listed.http), Either.right(sessions));
  const events: ReadonlyArray<ChatEvent> = [{ is: "user", text: "Hi" }];
  const loaded = recording({ status: 200, text: JSON.stringify({ events }) });
  assertEquals(run(loadAssistantSession(base, "s 1"), loaded.http), Either.right(events));
  assertEquals(loaded.sent, [["GET", `${base}/sessions/s%201`, null]]);
});

Deno.test("the service's state says which log to follow, and where it's up to", () => {
  const { sent, http } = recording({ status: 200, text: `{"log":"L","latest":3}` });
  assertEquals(run(assistantState(base), http), Either.right({ log: "L", latest: 3 }));
  assertEquals(sent, [["GET", `${base}/state`, null]]);
});

Deno.test("followAssistant can follow past the end of a turn, for as long as the connection lasts", () => {
  const events: Array<LoggedEvent> = [];
  const logged = (seq: number, event: LoggedEvent["event"]): LoggedEvent => ({
    seq,
    event,
    transient: false,
    sessionId: null,
  });
  const { http } = streaming(200, [
    line(logged(1, { is: "done", costUsd: null, durationMs: 1 })),
    line(logged(2, { is: "started" })),
  ]);
  run(followAssistant(base, "L", 0, (e) => events.push(e), false), http);
  assertEquals(events.map((e) => e.seq), [1, 2]);
});
