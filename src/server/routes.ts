/**
 * Functional core of the webserver: every routing and validation decision
 * lives here. All I/O goes through the injected {@link ServerIo} pipes.
 */
import { Effect, Either, Schema } from "effect";
import { emptyLayout, Layout } from "../common/model.ts";
import { routeBackgrounds } from "./backgrounds.ts";
import {
  BadRequest,
  CorruptData,
  type HttpRequest,
  type HttpResponse,
  json,
  methodNotAllowed,
  type RouteError,
  ServerIo,
  type Site,
  text,
} from "./http.ts";

type StoredText = { found: true; text: string } | { found: false };

/** File name the bundler gives the client entry point (src/client/main.tsx). */
export const clientScript = "main.js";

export const page = (buildId: string): string =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Home</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏠</text></svg>">
    <style>html, body, #root { height: 100%; margin: 0; overflow: hidden; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/web/assets/${clientScript}?v=${buildId}"></script>
  </body>
</html>
`;

const decodeLayoutJson = (raw: string) =>
  Either.flatMap(
    Either.try({ try: (): unknown => JSON.parse(raw), catch: String }),
    (parsed) =>
      Either.mapLeft(
        Schema.decodeUnknownEither(Layout)(parsed),
        (error) => error.message,
      ),
  );

const getLayout = Effect.gen(function* () {
  const io = yield* ServerIo;
  const stored = yield* io.readLayoutFile.pipe(
    Effect.map((t): StoredText => ({ found: true, text: t })),
    Effect.catchIf(
      (e) => e.cause instanceof Deno.errors.NotFound,
      () => Effect.succeed<StoredText>({ found: false }),
    ),
  );
  if (!stored.found) {
    return json(emptyLayout);
  }
  const layout = decodeLayoutJson(stored.text);
  if (Either.isLeft(layout)) {
    return yield* new CorruptData({
      message: `Stored layout is invalid: ${layout.left}`,
    });
  }
  return json(layout.right);
});

const putLayout = (request: HttpRequest) =>
  Effect.gen(function* () {
    const io = yield* ServerIo;
    const raw = yield* request.body;
    const layout = decodeLayoutJson(raw);
    if (Either.isLeft(layout)) {
      return yield* new BadRequest({ message: layout.left });
    }
    yield* io.writeLayoutTempFile(JSON.stringify(layout.right, null, 2) + "\n");
    yield* io.commitLayoutTempFile;
    return { status: 204, headers: {}, body: null } satisfies HttpResponse;
  });

const route = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, RouteError, ServerIo> => {
  const { pathname } = request.url;
  const isRead = request.method === "GET" || request.method === "HEAD";

  if (pathname === "/" && isRead) {
    return Effect.succeed({
      status: 302,
      headers: { location: "/web/app" },
      body: null,
    });
  }
  if ((pathname === "/web/app" || pathname === "/web/app/") && isRead) {
    return Effect.succeed({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
      body: page(site.buildId),
    });
  }
  if (pathname.startsWith("/web/assets/") && isRead) {
    const asset = site.assets.get(pathname.slice("/web/assets/".length));
    if (asset === undefined) {
      return Effect.succeed(text(404, "Not found"));
    }
    return Effect.succeed({
      status: 200,
      headers: { "content-type": asset.contentType, "cache-control": "no-cache" },
      body: asset.body,
    });
  }
  if (pathname === "/api/layout") {
    switch (request.method) {
      case "GET":
        return getLayout;
      case "PUT":
        return putLayout(request);
      default:
        return Effect.succeed(methodNotAllowed("GET, PUT"));
    }
  }
  if (pathname === "/api/backgrounds" || pathname.startsWith("/api/backgrounds/")) {
    return routeBackgrounds(request, site);
  }
  return Effect.succeed(text(404, "Not found"));
};

export const handle = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, never, ServerIo> => {
  if (!site.hosts.has(request.url.host)) {
    return Effect.succeed(text(421, "Misdirected request"));
  }
  const crossOrigin = request.origin !== null &&
    request.origin !== request.url.origin;
  if (crossOrigin) {
    return Effect.succeed(text(403, "Cross-origin requests are not allowed"));
  }
  return route(request, site).pipe(
    Effect.catchTags({
      BadRequest: (e) => Effect.succeed(text(400, e.message)),
      CorruptData: (e) => Effect.succeed(text(500, e.message)),
      UpstreamFailed: (e) => Effect.succeed(text(502, e.message)),
      IoError: (e) => Effect.succeed(text(500, String(e.cause))),
    }),
  );
};
