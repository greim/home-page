/**
 * Serves the widget build's output. It's read from disk on each request, so a
 * rebuild is picked up without restarting the server.
 */
import { Effect } from "effect";
import { contentTypeFor, type HttpResponse, ServerIo, text } from "./http.ts";
import { registryFile } from "../common/widgets.ts";

/** The only paths the build writes: the registry, and each widget's bundle and source map. */
const servable = /^(registry\.json|[a-z0-9]+(-[a-z0-9]+)*\/main\.js(\.map)?)$/;

/** A versioned bundle URL changes with its content, so the browser may keep it. */
const cacheControl = (path: string, versioned: boolean) =>
  versioned && path !== registryFile ? "public, max-age=31536000, immutable" : "no-cache";

export const serveWidgetFile = (path: string, versioned: boolean) =>
  Effect.gen(function* () {
    if (!servable.test(path)) {
      return text(404, "Not found");
    }
    const io = yield* ServerIo;
    return yield* io.readWidgetFile(path).pipe(
      Effect.map((body): HttpResponse => ({
        status: 200,
        headers: {
          "content-type": contentTypeFor(path),
          "cache-control": cacheControl(path, versioned),
        },
        body,
      })),
      Effect.catchIf(
        (e) => e.cause instanceof Deno.errors.NotFound,
        () => Effect.succeed(text(404, "Not found")),
      ),
    );
  });
