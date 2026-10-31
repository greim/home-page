/**
 * Background images: listing the built-in and saved ones, saving uploads, and
 * fetching images from the web so they're stored locally.
 *
 * Saved images live in data/backgrounds/, named by a hash of their content so
 * the same image is never stored twice. Their type is detected from the bytes
 * themselves, never from a client-supplied name or header.
 */
import { Effect, Either, Schema } from "effect";
import {
  BadRequest,
  type Bytes,
  contentTypeFor,
  type HttpRequest,
  type HttpResponse,
  json,
  methodNotAllowed,
  type RouteError,
  ServerIo,
  type Site,
  text,
  UpstreamFailed,
} from "./http.ts";

export const maxImageBytes = 10 * 1024 * 1024;

export const savedPrefix = "/api/backgrounds/";
const builtinPrefix = "/web/assets/";

/** File names this module creates; anything else is never read or served. */
const savedName = /^[0-9a-f]{16}\.(png|jpg|gif|webp|avif)$/;

type ImageExt = "png" | "jpg" | "gif" | "webp" | "avif";

const ascii = (bytes: Bytes, start: number, end: number): string =>
  String.fromCharCode(...bytes.subarray(start, end));

/** Identifies an image from its leading bytes. SVG is deliberately excluded (it can run script). */
export const sniffImage = (bytes: Bytes): ImageExt | null => {
  const startsWith = (...sig: ReadonlyArray<number>) => sig.every((b, i) => bytes.at(i) === b);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (startsWith(0xff, 0xd8, 0xff)) return "jpg";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  const brand = ascii(bytes, 8, 12);
  if (ascii(bytes, 4, 8) === "ftyp" && (brand === "avif" || brand === "avis")) return "avif";
  return null;
};

const hashPrefix = (bytes: Bytes): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", bytes)).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest).subarray(0, 8), (b) => b.toString(16).padStart(2, "0"))
        .join("")
    ),
  );

/** Validates and stores an image, returning its same-origin URL. */
const saveImage = (bytes: Bytes) =>
  Effect.gen(function* () {
    if (bytes.length > maxImageBytes) {
      return yield* new BadRequest({
        message: `Image is larger than ${maxImageBytes / 1024 / 1024} MB`,
      });
    }
    const ext = sniffImage(bytes);
    if (ext === null) {
      return yield* new BadRequest({
        message: "Not a supported image (PNG, JPEG, GIF, WebP or AVIF)",
      });
    }
    const name = `${yield* hashPrefix(bytes)}.${ext}`;
    const io = yield* ServerIo;
    yield* io.writeBackgroundFile(name, bytes);
    return json({ url: `${savedPrefix}${name}` }, 201);
  });

const listImages = (site: Site) =>
  Effect.gen(function* () {
    const io = yield* ServerIo;
    const builtin = [...site.assets]
      .filter(([, asset]) => asset.contentType.startsWith("image/"))
      .map(([name]) => `${builtinPrefix}${name}`)
      .sort();
    const saved = (yield* io.listBackgroundFiles)
      .filter((name) => savedName.test(name))
      .sort()
      .map((name) => `${savedPrefix}${name}`);
    return json({ images: [...builtin, ...saved] });
  });

const FetchRequest = Schema.parseJson(Schema.Struct({ url: Schema.String }));

const fetchImage = (request: HttpRequest) =>
  Effect.gen(function* () {
    const decoded = Schema.decodeUnknownEither(FetchRequest)(yield* request.body);
    if (Either.isLeft(decoded)) {
      return yield* new BadRequest({ message: `Expected {"url": "..."}` });
    }
    const raw = decoded.right.url.trim();
    const url = URL.canParse(raw) ? new URL(raw) : null;
    if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) {
      return yield* new BadRequest({ message: `Not an http(s) URL: ${raw}` });
    }
    const io = yield* ServerIo;
    const response = yield* io.fetchRemote(url).pipe(
      Effect.mapError((e) =>
        new UpstreamFailed({ message: `Couldn't fetch ${url}: ${String(e.cause)}` })
      ),
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* new UpstreamFailed({
        message: `Couldn't fetch ${url}: HTTP ${response.status}`,
      });
    }
    return yield* saveImage(response.bytes);
  });

const serveSaved = (name: string) =>
  Effect.gen(function* () {
    if (!savedName.test(name)) {
      return text(404, "Not found");
    }
    const io = yield* ServerIo;
    const found = yield* io.readBackgroundFile(name).pipe(
      Effect.map((bytes) => ({ found: true as const, bytes })),
      Effect.catchIf(
        (e) => e.cause instanceof Deno.errors.NotFound,
        () => Effect.succeed({ found: false as const }),
      ),
    );
    if (!found.found) {
      return text(404, "Not found");
    }
    return {
      status: 200,
      headers: {
        "content-type": contentTypeFor(name),
        // Content-addressed: a given name always holds the same bytes.
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: found.bytes,
    } satisfies HttpResponse;
  });

/** Handles everything under /api/backgrounds. */
export const routeBackgrounds = (
  request: HttpRequest,
  site: Site,
): Effect.Effect<HttpResponse, RouteError, ServerIo> => {
  const { pathname } = request.url;
  if (pathname === "/api/backgrounds") {
    switch (request.method) {
      case "GET":
        return listImages(site);
      case "POST":
        return Effect.flatMap(request.bytes, saveImage);
      default:
        return Effect.succeed(methodNotAllowed("GET, POST"));
    }
  }
  if (pathname === "/api/backgrounds/fetch") {
    return request.method === "POST"
      ? fetchImage(request)
      : Effect.succeed(methodNotAllowed("POST"));
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Effect.succeed(methodNotAllowed("GET"));
  }
  return serveSaved(pathname.slice(savedPrefix.length));
};
