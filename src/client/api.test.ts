import { assertEquals } from "@std/assert";
import { Effect, Either, Stream } from "effect";
import type { ChatEvent } from "../common/assistant.ts";
import { emptyLayout } from "../common/model.ts";
import { ApiError, askAssistant, Http, type HttpResult, loadLayout, saveLayout } from "./api.ts";

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

const streaming = (status: number, chunks: ReadonlyArray<string>) => {
  const sent: Array<unknown> = [];
  const http = Http.of({
    request: () => Effect.die("unexpected request"),
    stream: (path, json) =>
      Effect.sync(() => {
        sent.push([path, JSON.parse(json)]);
        return { status, chunks: Stream.fromIterable(chunks) };
      }),
  });
  return { sent, http };
};

Deno.test("askAssistant posts the message and hands over each event as it arrives", () => {
  const { sent, http } = streaming(200, [
    `{"is":"session","sessionId":"s1"}\n{"is":"te`,
    `xt","text":"Hi"}\n\n`,
    `{"is":"done","costUsd":null,"durationMs":5}`,
  ]);
  const events: Array<ChatEvent> = [];
  const result = run(
    askAssistant(
      { message: "Hello", sessionId: null, screenshot: new Uint8Array([1, 2, 3]) },
      (e) => events.push(e),
    ),
    http,
  );
  assertEquals(result, Either.right(undefined));
  assertEquals(sent, [["/api/assistant", {
    message: "Hello",
    sessionId: null,
    screenshot: "AQID",
  }]]);
  assertEquals(events, [
    { is: "session", sessionId: "s1" },
    { is: "text", text: "Hi" },
    { is: "done", costUsd: null, durationMs: 5 },
  ]);
});

Deno.test("askAssistant fails on error statuses and malformed events", () => {
  const rejected = streaming(400, ["Bad ", "request"]);
  assertEquals(
    run(askAssistant({ message: "x", sessionId: null, screenshot: null }, () => {}), rejected.http),
    Either.left("Server responded 400: Bad request"),
  );
  const garbled = streaming(200, [`{"is":"nope"}\n`]);
  const result = run(
    askAssistant({ message: "x", sessionId: null, screenshot: null }, () => {}),
    garbled.http,
  );
  assertEquals(Either.isLeft(result), true);
});

Deno.test("askAssistant refuses to send an empty message", () => {
  const { sent, http } = streaming(200, []);
  const result = run(
    askAssistant({ message: "", sessionId: null, screenshot: null }, () => {}),
    http,
  );
  assertEquals(Either.isLeft(result), true);
  assertEquals(sent, []);
});
