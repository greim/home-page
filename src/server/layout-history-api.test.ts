import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { defaultSchedule } from "../common/day-cycle.ts";
import { type Layout, newColumn } from "../common/model.ts";
import { type HttpRequest, IoError, ServerIo } from "./http.ts";
import { layoutHistoryServed } from "./layout-history-api.ts";
import { GitFailed, LayoutHistoryService, type Pending, type Version } from "./layout-history.ts";
import { layoutText } from "./layout-store.ts";
import { handleWidgetApis } from "./widget-api-routes.ts";

const live: Layout = { version: 1, schedule: defaultSchedule, columns: [newColumn("a", "LuStar")] };

const version: Version = { id: "a1b2c3d", date: "2026-11-21T10:00:00-05:00", message: "Add news" };

type Fake = {
  pending?: Pending;
  failWith?: string;
  stored?: string;
};

/** The history and layout file in memory, recording what the history was asked to do. */
const world = (fake: Fake = {}) => {
  const asked: Array<string> = [];
  const fail = fake.failWith === undefined
    ? Effect.void
    : Effect.fail(new GitFailed({ message: fake.failWith }));
  const history = LayoutHistoryService.of({
    available: Effect.void,
    status: Effect.zipRight(fail, Effect.succeed(fake.pending ?? "clean")),
    versions: (limit) =>
      Effect.zipRight(
        Effect.sync(() => void asked.push(`versions ${limit}`)),
        Effect.zipRight(fail, Effect.succeed([version])),
      ),
    accept: (message) =>
      Effect.zipRight(
        Effect.sync(() => void asked.push(`accept ${message}`)),
        Effect.zipRight(fail, Effect.succeed(true)),
      ),
    diff: Effect.zipRight(fail, Effect.succeed("@@ -1 +1 @@\n-a\n+b\n")),
    changes: (id) =>
      Effect.zipRight(
        Effect.sync(() => void asked.push(`changes ${id}`)),
        Effect.zipRight(fail, Effect.succeed("@@ -1 +1 @@\n-b\n+c\n")),
      ),
    discard: Effect.zipRight(
      Effect.sync(() => void asked.push("discard")),
      Effect.zipRight(fail, Effect.succeed(true)),
    ),
    restore: (id) =>
      Effect.zipRight(
        Effect.sync(() => void asked.push(`restore ${id}`)),
        fail,
      ),
  });
  const stored = fake.stored ?? layoutText(live);
  const io = ServerIo.of({
    readLayoutFile: stored === "unreadable"
      ? Effect.fail(new IoError({ cause: "disk on fire" }))
      : Effect.succeed(stored),
    writeLayoutTempFile: () => Effect.die("unused"),
    commitLayoutTempFile: Effect.die("unused"),
    readWidgetFile: () => Effect.die("unused"),
    httpGet: () => Effect.die("unused"),
  });
  return { history, io, asked };
};

const post = (fake: Fake, operation: string, input: unknown) => {
  const { history, io, asked } = world(fake);
  const request: HttpRequest = {
    method: "POST",
    url: new URL(`https://localhost/api/widget-apis/layout-history/${operation}`),
    origin: null,
    body: Effect.succeed(JSON.stringify({ caller: { widgetType: "page", widgetId: "p" }, input })),
  };
  return Effect.runPromise(
    handleWidgetApis(request, [layoutHistoryServed]).pipe(
      Effect.provideService(ServerIo, io),
      Effect.provideService(LayoutHistoryService, history),
    ),
  ).then((r) => ({
    status: r.status,
    body: r.status === 200 ? JSON.parse(String(r.body)) : String(r.body),
    asked,
  }));
};

Deno.test("status answers with whether the layout has changes", async () => {
  const answer = await post({ pending: "modified" }, "status", {});
  assertEquals(answer.body, { ok: true, value: "modified" });
});

Deno.test("diff answers with what changed", async () => {
  const answer = await post({}, "diff", {});
  assertEquals(answer.body, { ok: true, value: "@@ -1 +1 @@\n-a\n+b\n" });
});

Deno.test("changes answers with what a version changed, for a real version only", async () => {
  const good = await post({}, "changes", { id: "a1b2c3d" });
  assertEquals(good.body, { ok: true, value: "@@ -1 +1 @@\n-b\n+c\n" });
  assertEquals(good.asked, ["changes a1b2c3d"]);
  const bad = await post({}, "changes", { id: "--output=x" });
  assertEquals(bad.body.error.is, "not-a-version");
  assertEquals(bad.asked, []);
});

Deno.test("accept passes on the message, and says whether it accepted", async () => {
  const answer = await post({}, "accept", { message: "Add news" });
  assertEquals(answer.body, { ok: true, value: true });
  assertEquals(answer.asked, ["accept Add news"]);
});

Deno.test("discard answers with the layout that's live afterwards", async () => {
  const answer = await post({}, "discard", {});
  assertEquals(answer.body, { ok: true, value: live });
  assertEquals(answer.asked, ["discard"]);
});

Deno.test("versions are listed up to the limit", async () => {
  const answer = await post({}, "versions", { limit: 20 });
  assertEquals(answer.body, { ok: true, value: [version] });
  assertEquals(answer.asked, ["versions 20"]);
});

Deno.test("restore answers with the layout it put in place, for a real version only", async () => {
  const good = await post({}, "restore", { id: "a1b2c3d" });
  assertEquals(good.body, { ok: true, value: live });
  assertEquals(good.asked, ["restore a1b2c3d"]);
  const bad = await post({}, "restore", { id: "--force" });
  assertEquals(bad.body, {
    ok: false,
    error: { is: "not-a-version", message: "Not a version: --force" },
  });
  assertEquals(bad.asked, []);
});

Deno.test("a git failure is a typed problem, with git's words", async () => {
  const failWith = "git status failed: index.lock exists";
  const problem = { ok: false, error: { is: "git-problem", message: failWith } };
  for (
    const [operation, input] of [
      ["status", {}],
      ["diff", {}],
      ["changes", { id: "a1b2c3d" }],
      ["accept", { message: "x" }],
      ["discard", {}],
      ["versions", { limit: 1 }],
      ["restore", { id: "a1b2c3d" }],
    ] as const
  ) {
    assertEquals((await post({ failWith }, operation, input)).body, problem, operation);
  }
});

Deno.test("a layout that can't be read after a change fails, saying why", async () => {
  const corrupt = await post({ stored: "[]" }, "discard", {});
  assertEquals(corrupt.status, 500);
  const unreadable = await post({ stored: "unreadable" }, "restore", { id: "a1b2c3d" });
  assertEquals(unreadable.status, 500);
});
