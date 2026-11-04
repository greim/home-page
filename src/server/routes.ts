/**
 * Functional core of the webserver: every routing and validation decision
 * lives here. All I/O goes through the injected {@link ServerIo} pipes.
 */
import { Effect, Either } from "effect";
import { AssistantIo, routeAssistant } from "./assistant.ts";
import { routeBackgrounds } from "./backgrounds.ts";
import {
  BadRequest,
  type HttpRequest,
  type HttpResponse,
  json,
  methodNotAllowed,
  type RouteError,
  ServerIo,
  type Site,
  text,
} from "./http.ts";
import { decodeLayoutJson, readLayout, writeLayout } from "./layout-store.ts";
import { widgetAssetsPath } from "../common/widgets.ts";
import { serveWidgetFile } from "./widget-files.ts";

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

const getLayout = readLayout.pipe(Effect.map((layout) => json(layout)));

const putLayout = (request: HttpRequest) =>
  Effect.gen(function* () {
    const raw = yield* request.body;
    const layout = decodeLayoutJson(raw);
    if (Either.isLeft(layout)) {
      return yield* new BadRequest({ message: layout.left });
    }
    yield* writeLayout(layout.right);
    return { status: 204, headers: {}, body: null } satisfies HttpResponse;
  });

const route = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, RouteError, ServerIo | AssistantIo> => {
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
  if (pathname.startsWith(widgetAssetsPath) && isRead) {
    return serveWidgetFile(
      pathname.slice(widgetAssetsPath.length),
      request.url.searchParams.has("v"),
    );
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
  if (pathname === "/api/assistant") {
    return request.method === "POST"
      ? routeAssistant(request)
      : Effect.succeed(methodNotAllowed("POST"));
  }
  if (pathname === "/api/backgrounds" || pathname.startsWith("/api/backgrounds/")) {
    return routeBackgrounds(request, site);
  }
  return Effect.succeed(text(404, "Not found"));
};

export const handle = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, never, ServerIo | AssistantIo> => {
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
