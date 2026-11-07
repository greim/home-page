/**
 * Imperative shell of the webserver: wires real I/O into the core in
 * routes.ts and starts an HTTPS (HTTP/2-capable) server on localhost only.
 */
import { Effect } from "effect";
import { bundleClient, BundlerIo, BundlerIoLive } from "../../tooling/bundle-client.ts";
import { AssistantIo } from "./assistant.ts";
import { assistantIoLive } from "./assistant-live.ts";
import { config } from "./config.ts";
import { type HttpRequest, type HttpResponse, IoError, ServerIo } from "./http.ts";
import { handle } from "./routes.ts";

/** Wraps a promise-returning call as an Effect that fails with IoError. */
const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

const io = ServerIo.of({
  readLayoutFile: Effect.tryPromise({
    try: () => Deno.readTextFile(config.layoutFile),
    catch: (cause) => new IoError({ cause }),
  }),
  writeLayoutTempFile: (text) =>
    Effect.tryPromise({
      try: () => Deno.writeTextFile(config.layoutTempFile, text),
      catch: (cause) => new IoError({ cause }),
    }),
  commitLayoutTempFile: Effect.tryPromise({
    try: () => Deno.rename(config.layoutTempFile, config.layoutFile),
    catch: (cause) => new IoError({ cause }),
  }),
  readWidgetFile: (path) => attempt(() => Deno.readFile(`${config.widgetsOutDir}/${path}`)),
});

const toHttpRequest = (request: Request): HttpRequest => ({
  method: request.method,
  url: new URL(request.url),
  origin: request.headers.get("origin"),
  body: attempt(() => request.text()),
});

const toResponse = (response: HttpResponse): Response =>
  new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });

// In its own process, so each build imports widgets' manifests afresh. Its
// output and any errors go to the server's log; a failed build leaves the last
// good one in place.
await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-read",
    `--allow-write=${config.distDir}`,
    "--allow-env",
    config.widgetBuildScript,
  ],
  stdout: "inherit",
  stderr: "inherit",
}).output();

const bundle = await Effect.runPromise(
  bundleClient(config.clientEntry).pipe(
    Effect.provideService(BundlerIo, BundlerIoLive),
  ),
);
const assistantIo = await Effect.runPromise(assistantIoLive(config.assistant));

const site = {
  hosts: config.hosts,
  buildId: bundle.buildId,
  assets: new Map(bundle.assets),
};

Deno.serve(
  {
    hostname: config.hostname,
    port: config.port,
    cert: await Deno.readTextFile(config.certFile),
    key: await Deno.readTextFile(config.keyFile),
    onListen: () => console.log(`Serving ${config.appUrl}`),
  },
  (request) =>
    Effect.runPromise(
      handle(toHttpRequest(request), site).pipe(
        Effect.provideService(ServerIo, io),
        Effect.provideService(AssistantIo, assistantIo),
        Effect.map(toResponse),
      ),
    ),
);
