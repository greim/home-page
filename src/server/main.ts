/**
 * Imperative shell of the webserver: wires real I/O into the core in
 * routes.ts and starts an HTTPS (HTTP/2-capable) server on localhost only.
 */
import { Effect } from "effect";
import { bundleClient, BundlerIo, BundlerIoLive } from "../../tooling/bundle-client.ts";
import { config } from "./config.ts";
import { contentTypeFor, type HttpRequest, type HttpResponse, IoError, ServerIo } from "./http.ts";
import { handle } from "./routes.ts";

/** Wraps a promise-returning call as an Effect that fails with IoError. */
const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

const backgroundFile = (name: string) => `${config.backgroundsDir}/${name}`;

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
  listBackgroundFiles: attempt(() =>
    Array.fromAsync(Deno.readDir(config.backgroundsDir), (entry) => entry.name)
  ),
  readBackgroundFile: (name) => attempt(() => Deno.readFile(backgroundFile(name))),
  writeBackgroundFile: (name, bytes) => attempt(() => Deno.writeFile(backgroundFile(name), bytes)),
  fetchRemote: (url) =>
    attempt(async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
    }),
});

const toHttpRequest = (request: Request): HttpRequest => ({
  method: request.method,
  url: new URL(request.url),
  origin: request.headers.get("origin"),
  body: attempt(() => request.text()),
  bytes: attempt(async () => new Uint8Array(await request.arrayBuffer())),
});

const toResponse = (response: HttpResponse): Response =>
  new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });

const bundle = await Effect.runPromise(
  bundleClient(config.clientEntry).pipe(
    Effect.provideService(BundlerIo, BundlerIoLive),
  ),
);
const staticAssets = await Array.fromAsync(
  Deno.readDir(config.staticDir),
  async (entry) =>
    [entry.name, {
      contentType: contentTypeFor(entry.name),
      body: await Deno.readFile(`${config.staticDir}/${entry.name}`),
    }] as const,
);
await Deno.mkdir(config.backgroundsDir, { recursive: true });

const site = {
  hosts: config.hosts,
  buildId: bundle.buildId,
  assets: new Map([...bundle.assets, ...staticAssets]),
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
        Effect.map(toResponse),
      ),
    ),
);
