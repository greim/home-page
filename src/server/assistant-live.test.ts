/**
 * Integration test for the assistant service's shell: real files in a temp
 * directory, a real `deno` running the layout check and reading module graphs,
 * and a real port.
 *
 * Not covered here: `startSession`, which runs Claude Code through the Agent SDK
 * and so needs a signed-in account and costs money. Check it by hand: run
 * `deno task start-assistant`, open the page in admin mode, ask the assistant
 * widget to add a column (the layout is applied), then to run `git status`
 * (a permission request appears; allowing it shows the output).
 *
 * Also by hand: `restartApp` and `exitForRestart`, which restart launchd jobs and end
 * the process. Under the installed services, ask the assistant to change a server file
 * (e.g. a comment in src/server/routes.ts): the chat says the server is restarting, then
 * that it's back.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import { assistantIoLive, type AssistantSettings } from "./assistant-live.ts";

/** Settings with everything in `dir`. */
const settingsIn = (dir: string, appPort = 1): AssistantSettings => ({
  repoDir: dir,
  workspaceDir: `${dir}/workspace`,
  layoutCheckScript: `${dir}/check.ts`,
  registryFile: `${dir}/dist/registry.json`,
  stepTimeoutMs: 60_000,
  watched: ["src", "deno.json"],
  entries: {
    app: "src/app.ts",
    page: ["src/page.ts", "src/shared.ts"],
    assistant: "src/assistant.ts",
  },
  appJob: "gui/0/test.unused",
  appPort,
});

Deno.test("the layout copy and screenshot are written to the workspace, and removed", async () => {
  const dir = await Deno.makeTempDir();
  const io = assistantIoLive(settingsIn(dir));
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
  // Writing the layout creates the workspace.
  await Effect.runPromise(io.writeWorkspaceLayout("{}\n"));
  assertEquals(await Effect.runPromise(io.readWorkspaceLayout), "{}\n");
  assertEquals(await Deno.readTextFile(`${dir}/workspace/layout.json`), "{}\n");
  await Effect.runPromise(io.writeWorkspaceScreenshot(jpeg));
  assertEquals(await Deno.readFile(`${dir}/workspace/screenshot.jpg`), jpeg);
  await Effect.runPromise(io.removeWorkspaceScreenshot);
  // Removing it again fails, as the core assumes, with the file's absence as the cause.
  const again = await Effect.runPromise(Effect.flip(io.removeWorkspaceScreenshot));
  assertEquals(again.cause instanceof Deno.errors.NotFound, true);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the layout check runs its script on the layout copy, failing with its output", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(
    `${dir}/check.ts`,
    `const text = await Deno.readTextFile(Deno.args[0]!);
if (text.includes("bad")) { console.error("Widget w1: its config is invalid"); Deno.exit(1); }`,
  );
  const io = assistantIoLive(settingsIn(dir));
  await Effect.runPromise(io.writeWorkspaceLayout(`{"good":true}`));
  assertEquals(await Effect.runPromise(io.checkWorkspaceLayout), { ok: true });
  await Effect.runPromise(io.writeWorkspaceLayout(`{"bad":true}`));
  const failed = await Effect.runPromise(io.checkWorkspaceLayout);
  assertEquals(failed.ok, false);
  assertStringIncludes(failed.ok ? "" : failed.diagnostic, "Layout check failed");
  assertStringIncludes(failed.ok ? "" : failed.diagnostic, "Widget w1: its config is invalid");
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the registry is read from the widget build's output", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/dist`);
  await Deno.writeTextFile(`${dir}/dist/registry.json`, `{"widgets":[]}`);
  const io = assistantIoLive(settingsIn(dir));
  assertEquals(await Effect.runPromise(io.readRegistry), `{"widgets":[]}`);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the fingerprint hashes the watched files, so any change shows", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/src/nested`, { recursive: true });
  await Deno.writeTextFile(`${dir}/src/nested/a.ts`, "a");
  await Deno.writeTextFile(`${dir}/deno.json`, "{}");
  await Deno.writeTextFile(`${dir}/README.md`, "not watched");
  const io = assistantIoLive(settingsIn(dir));
  const before = await Effect.runPromise(io.fingerprint);
  assertEquals([...before.keys()].sort(), ["deno.json", "src/nested/a.ts"]);
  await Deno.writeTextFile(`${dir}/src/nested/a.ts`, "b");
  const after = await Effect.runPromise(io.fingerprint);
  assertEquals(before.get("deno.json"), after.get("deno.json"));
  assertEquals(before.get("src/nested/a.ts") === after.get("src/nested/a.ts"), false);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("module graphs list each entry point's local modules, relative to the repo", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/src`);
  await Deno.writeTextFile(`${dir}/src/shared.ts`, "export const x = 1;");
  await Deno.writeTextFile(`${dir}/src/app.ts`, 'import { x } from "./shared.ts"; x;');
  await Deno.writeTextFile(`${dir}/src/page.ts`, "export {};");
  await Deno.writeTextFile(`${dir}/src/assistant.ts`, 'import { x } from "./shared.ts"; x;');
  const graphs = await Effect.runPromise(assistantIoLive(settingsIn(dir)).moduleGraphs);
  assertEquals([...graphs.app].sort(), ["src/app.ts", "src/shared.ts"]);
  // The page has several entry points (its own, and the shared modules): its graph covers them all.
  assertEquals([...graphs.page].sort(), ["src/page.ts", "src/shared.ts"]);
  assertEquals([...graphs.assistant].sort(), ["src/assistant.ts", "src/shared.ts"]);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("a module graph that can't be read fails, saying why", async () => {
  const dir = await Deno.makeTempDir();
  const failed = await Effect.runPromise(
    Effect.flip(assistantIoLive(settingsIn(dir)).moduleGraphs),
  );
  assertEquals(String(failed.cause).length > 0, true);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the main server counts as listening when its port takes connections", async () => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  const accepting = (async () => {
    for await (const conn of listener) conn.close();
  })();
  assertEquals(
    await Effect.runPromise(assistantIoLive(settingsIn("/tmp", port)).appListening),
    true,
  );
  listener.close();
  await accepting.catch(() => {});
  assertEquals(
    await Effect.runPromise(assistantIoLive(settingsIn("/tmp", port)).appListening),
    false,
  );
});
