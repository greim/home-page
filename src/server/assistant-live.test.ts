/**
 * Integration test for the assistant's shell: real files in a temp directory
 * and a real process, standing in for claude. Talking to the real claude is a
 * manual check: in admin mode, open the assistant and ask it to add a column.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Stream } from "effect";
import { assistantIoLive, type AssistantSettings } from "./assistant-live.ts";

/** Settings with everything in `dir`. */
const settingsIn = (
  dir: string,
  overrides: Partial<AssistantSettings> = {},
): AssistantSettings => ({
  claudePath: `${dir}/claude`,
  workspaceDir: `${dir}/workspace`,
  repoDir: dir,
  widgetsDir: `${dir}/widgets`,
  secretsDir: `${dir}/.secrets`,
  backgroundsDir: `${dir}/backgrounds`,
  distDir: `${dir}/dist`,
  widgetBuildScript: `${dir}/build.ts`,
  layoutCheckScript: `${dir}/check.ts`,
  registryFile: `${dir}/dist/registry.json`,
  stepTimeoutMs: 60_000,
  ...overrides,
});

const fakeClaude = `#!/bin/sh
cat > prompt.txt
printf '%s\\n' "$@" > args.txt
echo '{"edited":true}' > layout.json
echo '{"type":"system","subtype":"init","session_id":"s1"}'
echo 'oops' >&2
exit 3
`;

Deno.test("the agent runs in its workspace with the prompt on stdin, and edits its layout copy", async () => {
  const dir = await Deno.makeTempDir();
  const claudePath = `${dir}/claude`;
  await Deno.writeTextFile(claudePath, fakeClaude, { mode: 0o755 });
  const settings = settingsIn(dir, { claudePath });

  const result = await Effect.runPromise(Effect.gen(function* () {
    const io = yield* assistantIoLive(settings);
    yield* io.writeWorkspaceLayout("{}\n");
    const before = yield* io.readWorkspaceLayout;
    const run = yield* Effect.scoped(Effect.gen(function* () {
      const agent = yield* io.startAgent("Add a column", "s0", null);
      const stdout = yield* agent.stdout.pipe(Stream.mkString);
      return { stdout, exit: yield* agent.exit };
    }));
    const after = yield* io.readWorkspaceLayout;
    return { before, run, after };
  }));

  assertEquals(result.before, "{}\n");
  assertEquals(result.run.stdout, `{"type":"system","subtype":"init","session_id":"s1"}\n`);
  assertEquals(result.run.exit, { code: 3, stderr: "oops\n" });
  assertEquals(result.after, `{"edited":true}\n`);
  assertEquals(await Deno.readTextFile(`${dir}/workspace/prompt.txt`), "Add a column");
  assertStringIncludes(
    await Deno.readTextFile(`${dir}/workspace/args.txt`),
    "--resume\ns0\n",
  );
  await Deno.remove(dir, { recursive: true });
});

Deno.test("an agent still running when its scope closes is killed", async () => {
  const dir = await Deno.makeTempDir();
  const claudePath = `${dir}/claude`;
  await Deno.writeTextFile(claudePath, "#!/bin/sh\necho started\nexec sleep 30\n", { mode: 0o755 });
  const settings = settingsIn(dir, { claudePath, workspaceDir: dir });

  const started = Date.now();
  const exit = await Effect.runPromise(Effect.gen(function* () {
    const io = yield* assistantIoLive(settings);
    const agent = yield* Effect.scoped(Effect.gen(function* () {
      const agent = yield* io.startAgent("Hi", null, null);
      yield* agent.stdout.pipe(Stream.take(1), Stream.runDrain);
      return agent;
    }));
    return yield* agent.exit;
  }));
  assertEquals(exit.code !== 0, true);
  assertEquals(Date.now() - started < 10_000, true);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the screenshot is written beside the layout copy, and removed", async () => {
  const dir = await Deno.makeTempDir();
  const settings = settingsIn(dir);
  const file = `${dir}/workspace/screenshot.jpg`;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
  const io = await Effect.runPromise(assistantIoLive(settings));
  await Effect.runPromise(io.writeWorkspaceLayout("{}\n"));
  await Effect.runPromise(io.writeWorkspaceScreenshot(jpeg));
  assertEquals(await Deno.readFile(file), jpeg);
  await Effect.runPromise(io.removeWorkspaceScreenshot);
  // Removing it again fails, as the core assumes, with the file's absence as the cause.
  const again = await Effect.runPromise(Effect.flip(io.removeWorkspaceScreenshot));
  assertEquals(again.cause instanceof Deno.errors.NotFound, true);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the widget fingerprint changes with any file's contents, and a missing folder has one", async () => {
  const dir = await Deno.makeTempDir();
  const io = await Effect.runPromise(assistantIoLive(settingsIn(dir)));
  const missing = await Effect.runPromise(io.fingerprintWidgets);
  await Deno.mkdir(`${dir}/widgets/clock`, { recursive: true });
  await Deno.writeTextFile(`${dir}/widgets/clock/main.tsx`, "a");
  const first = await Effect.runPromise(io.fingerprintWidgets);
  assertEquals(await Effect.runPromise(io.fingerprintWidgets), first);
  await Deno.writeTextFile(`${dir}/widgets/clock/main.tsx`, "b");
  const second = await Effect.runPromise(io.fingerprintWidgets);
  assertEquals(new Set([missing, first, second]).size, 3);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the layout check runs its script on the layout copy, failing with its output", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(
    `${dir}/check.ts`,
    `const text = await Deno.readTextFile(Deno.args[0]!);
if (text.includes("bad")) { console.error("Widget w1: its config is invalid"); Deno.exit(1); }`,
  );
  const io = await Effect.runPromise(assistantIoLive(settingsIn(dir)));
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
  const io = await Effect.runPromise(assistantIoLive(settingsIn(dir)));
  assertEquals(await Effect.runPromise(io.readRegistry), `{"widgets":[]}`);
  await Deno.remove(dir, { recursive: true });
});
