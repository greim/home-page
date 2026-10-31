import { assertEquals, assertMatch } from "@std/assert";
import { Effect } from "effect";
import { maxImageBytes, sniffImage } from "./backgrounds.ts";
import {
  type Bytes,
  type HttpRequest,
  type HttpResponse,
  IoError,
  ServerIo,
  type Site,
} from "./http.ts";
import { handle } from "./routes.ts";

const bytes = (...values: ReadonlyArray<number>): Bytes => new Uint8Array(values);
const ascii = (s: string): ReadonlyArray<number> => Array.from(s, (c) => c.charCodeAt(0));

const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const jpg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);

const site: Site = {
  hosts: new Set(["localhost:8443"]),
  assets: new Map([
    ["main.js", { contentType: "text/javascript", body: bytes() }],
    ["trees.jpg", { contentType: "image/jpeg", body: jpg }],
    ["tile.webp", { contentType: "image/webp", body: bytes() }],
  ]),
  buildId: "abc",
};

const request = (
  method: string,
  path: string,
  body: { text?: string; bytes?: Bytes } = {},
): HttpRequest => ({
  method,
  url: new URL(path, "https://localhost:8443"),
  origin: null,
  body: Effect.succeed(body.text ?? ""),
  bytes: Effect.succeed(body.bytes ?? bytes()),
});

const unused = Effect.die("unexpected I/O");
const noIo = ServerIo.of({
  readLayoutFile: unused,
  writeLayoutTempFile: () => unused,
  commitLayoutTempFile: unused,
  listBackgroundFiles: unused,
  readBackgroundFile: () => unused,
  writeBackgroundFile: () => unused,
  fetchRemote: () => unused,
});

const run = (req: HttpRequest, io: Partial<ServerIo["Type"]> = {}): Promise<HttpResponse> =>
  Effect.runPromise(handle(req, site).pipe(Effect.provideService(ServerIo, { ...noIo, ...io })));

const bodyJson = (res: HttpResponse): unknown => JSON.parse(String(res.body));

Deno.test("sniffImage recognizes supported formats by their bytes", () => {
  assertEquals(sniffImage(png), "png");
  assertEquals(sniffImage(jpg), "jpg");
  assertEquals(sniffImage(bytes(...ascii("GIF89a"))), "gif");
  assertEquals(sniffImage(bytes(...ascii("RIFF\0\0\0\0WEBPVP8 "))), "webp");
  assertEquals(sniffImage(bytes(...ascii("\0\0\0\x1cftypavif"))), "avif");
  assertEquals(sniffImage(bytes(...ascii("\0\0\0\x1cftypavis"))), "avif");
});

Deno.test("sniffImage rejects SVG, HTML, and empty input", () => {
  assertEquals(sniffImage(bytes(...ascii("<svg xmlns="))), null);
  assertEquals(sniffImage(bytes(...ascii("<!doctype html>"))), null);
  assertEquals(sniffImage(bytes(...ascii("\0\0\0\x1cftypmp42"))), null);
  assertEquals(sniffImage(bytes()), null);
});

Deno.test("GET /api/backgrounds lists built-in images, then saved ones", async () => {
  const res = await run(request("GET", "/api/backgrounds"), {
    listBackgroundFiles: Effect.succeed([
      "ffffffffffffffff.png",
      "0123456789abcdef.jpg",
      "notes.txt",
      "evil.svg",
    ]),
  });
  assertEquals(bodyJson(res), {
    images: [
      "/web/assets/tile.webp",
      "/web/assets/trees.jpg",
      "/api/backgrounds/0123456789abcdef.jpg",
      "/api/backgrounds/ffffffffffffffff.png",
    ],
  });
});

Deno.test("POST /api/backgrounds saves an image under a content-hash name", async () => {
  const written: Array<[string, Bytes]> = [];
  const res = await run(request("POST", "/api/backgrounds", { bytes: png }), {
    writeBackgroundFile: (name, b) => Effect.sync(() => void written.push([name, b])),
  });
  assertEquals(res.status, 201);
  const { url } = bodyJson(res) as { url: string };
  assertMatch(url, /^\/api\/backgrounds\/[0-9a-f]{16}\.png$/);
  assertEquals(written, [[url.slice("/api/backgrounds/".length), png]]);
  // The same bytes always get the same name.
  const again = await run(request("POST", "/api/backgrounds", { bytes: png }), {
    writeBackgroundFile: () => Effect.void,
  });
  assertEquals(bodyJson(again), { url });
});

Deno.test("POST /api/backgrounds rejects non-images and oversized files", async () => {
  const notImage = await run(
    request("POST", "/api/backgrounds", { bytes: bytes(...ascii("<svg/>")) }),
  );
  assertEquals(notImage.status, 400);
  const huge = new Uint8Array(maxImageBytes + 1);
  huge.set(png);
  const tooBig = await run(request("POST", "/api/backgrounds", { bytes: huge }));
  assertEquals(tooBig.status, 400);
});

Deno.test("POST /api/backgrounds/fetch downloads and saves a remote image", async () => {
  const fetched: Array<string> = [];
  const res = await run(
    request("POST", "/api/backgrounds/fetch", { text: `{"url":" https://x.test/a.jpg "}` }),
    {
      fetchRemote: (url) =>
        Effect.sync(() => {
          fetched.push(url.href);
          return { status: 200, bytes: jpg };
        }),
      writeBackgroundFile: () => Effect.void,
    },
  );
  assertEquals(res.status, 201);
  assertMatch((bodyJson(res) as { url: string }).url, /\.jpg$/);
  assertEquals(fetched, ["https://x.test/a.jpg"]);
});

Deno.test("POST /api/backgrounds/fetch rejects bad requests", async () => {
  for (
    const text of ["nope", `{"href":"x"}`, `{"url":"not a url"}`, `{"url":"file:///etc/passwd"}`]
  ) {
    const res = await run(request("POST", "/api/backgrounds/fetch", { text }));
    assertEquals(res.status, 400, text);
  }
});

Deno.test("POST /api/backgrounds/fetch reports upstream failures as 502", async () => {
  const req = () =>
    request("POST", "/api/backgrounds/fetch", { text: `{"url":"https://x.test/a"}` });
  const httpError = await run(req(), {
    fetchRemote: () => Effect.succeed({ status: 404, bytes: bytes() }),
  });
  assertEquals([httpError.status, httpError.body], [
    502,
    "Couldn't fetch https://x.test/a: HTTP 404",
  ]);
  const network = await run(req(), {
    fetchRemote: () => Effect.fail(new IoError({ cause: "connection refused" })),
  });
  assertEquals([network.status, network.body], [
    502,
    "Couldn't fetch https://x.test/a: connection refused",
  ]);
  const notImage = await run(req(), {
    fetchRemote: () => Effect.succeed({ status: 200, bytes: bytes(...ascii("<html>")) }),
  });
  assertEquals(notImage.status, 400);
});

Deno.test("GET /api/backgrounds/<name> serves saved images, cached forever", async () => {
  const res = await run(request("GET", "/api/backgrounds/0123456789abcdef.png"), {
    readBackgroundFile: (name) => Effect.succeed(name === "0123456789abcdef.png" ? png : bytes()),
  });
  assertEquals(res.status, 200);
  assertEquals(res.body, png);
  assertEquals(res.headers["content-type"], "image/png");
  assertMatch(res.headers["cache-control"] ?? "", /immutable/);
});

Deno.test("GET /api/backgrounds/<name> 404s for unknown or unexpected names", async () => {
  const missing = await run(request("GET", "/api/backgrounds/0123456789abcdef.png"), {
    readBackgroundFile: () => Effect.fail(new IoError({ cause: new Deno.errors.NotFound("x") })),
  });
  assertEquals(missing.status, 404);
  for (const name of ["..%2Flayout.json", "layout.json", "0123456789abcdef.svg"]) {
    assertEquals((await run(request("GET", `/api/backgrounds/${name}`))).status, 404, name);
  }
});

Deno.test("background routes reject unsupported methods", async () => {
  assertEquals((await run(request("PUT", "/api/backgrounds"))).status, 405);
  assertEquals((await run(request("GET", "/api/backgrounds/fetch"))).status, 405);
  assertEquals((await run(request("DELETE", "/api/backgrounds/0123456789abcdef.png"))).status, 405);
});
