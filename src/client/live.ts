/** Imperative shell for the browser: real network and clipboard pipes. */
import { Effect, Stream } from "effect";
import { ApiError, Http } from "./api.ts";

export const HttpLive = Http.of({
  request: (method, path, body, contentType) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(path, {
          method,
          body,
          headers: { "content-type": contentType },
        });
        return { status: response.status, text: await response.text() };
      },
      catch: (cause) => new ApiError({ message: String(cause) }),
    }),
  stream: (path, json) =>
    Effect.tryPromise({
      try: () =>
        fetch(path, {
          method: "POST",
          body: json,
          headers: { "content-type": "application/json" },
        }),
      catch: (cause) => new ApiError({ message: String(cause) }),
    }).pipe(Effect.map((response) => ({
      status: response.status,
      chunks: Stream.fromReadableStream({
        evaluate: () => (response.body ?? new Blob().stream()).pipeThrough(new TextDecoderStream()),
        onError: (cause) => new ApiError({ message: String(cause) }),
      }),
    }))),
});

export const run = <A, E>(effect: Effect.Effect<A, E, Http>) =>
  Effect.runPromise(Effect.either(Effect.provideService(effect, Http, HttpLive)));

export const copyToClipboard = (text: string): Effect.Effect<void, string> =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: String,
  });

export const readFileBytes = (file: File): Effect.Effect<Uint8Array<ArrayBuffer>, string> =>
  Effect.tryPromise({
    try: async () => new Uint8Array(await file.arrayBuffer()),
    catch: String,
  });
