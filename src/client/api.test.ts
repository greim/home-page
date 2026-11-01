import { assertEquals } from "@std/assert";
import { Effect, Either, Stream } from "effect";
import type { ChatEvent } from "../common/assistant.ts";
import { emptyLayout } from "../common/model.ts";
import {
  ApiError,
  askAssistant,
  fetchBackground,
  Http,
  type HttpResult,
  listBackgrounds,
  loadLayout,
  saveLayout,
  uploadBackground,
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

const recording = (result: HttpResult) => {
  const sent: Array<unknown> = [];
  const http = Http.of({
    request: (method, path, body, contentType) =>
      Effect.sync(() => {
        sent.push([method, path, body, contentType]);
        return result;
      }),
    stream: noStream,
  });
  return { sent, http };
};

Deno.test("listBackgrounds returns the image URLs", () => {
  const images = ["/web/assets/trees.jpg", "/api/backgrounds/0123456789abcdef.png"];
  const { http } = recording({ status: 200, text: JSON.stringify({ images }) });
  assertEquals(run(listBackgrounds, http), Either.right(images));
});

Deno.test("listBackgrounds rejects non-local URLs", () => {
  const { http } = recording({ status: 200, text: `{"images":["https://evil.test/x.png"]}` });
  assertEquals(Either.isLeft(run(listBackgrounds, http)), true);
});

Deno.test("uploadBackground POSTs raw bytes and returns the saved URL", () => {
  const url = "/api/backgrounds/0123456789abcdef.png";
  const { sent, http } = recording({ status: 201, text: JSON.stringify({ url }) });
  const bytes = new Uint8Array([1, 2, 3]);
  assertEquals(run(uploadBackground(bytes), http), Either.right(url));
  assertEquals(sent, [["POST", "/api/backgrounds", bytes, "application/octet-stream"]]);
});

Deno.test("fetchBackground asks the server to fetch a URL", () => {
  const url = "/api/backgrounds/0123456789abcdef.jpg";
  const { sent, http } = recording({ status: 201, text: JSON.stringify({ url }) });
  assertEquals(run(fetchBackground("https://x.test/a.jpg"), http), Either.right(url));
  assertEquals(sent, [[
    "POST",
    "/api/backgrounds/fetch",
    `{"url":"https://x.test/a.jpg"}`,
    "application/json",
  ]]);
});

Deno.test("fetchBackground surfaces server errors", () => {
  const { http } = recording({ status: 502, text: "Couldn't fetch: HTTP 404" });
  assertEquals(
    run(fetchBackground("https://x.test/a.jpg"), http),
    Either.left("Server responded 502: Couldn't fetch: HTTP 404"),
  );
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
