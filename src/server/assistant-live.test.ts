/**
 * Integration test for the assistant's shell: real files in a temp directory
 * and a real process, standing in for claude. Talking to the real claude is a
 * manual check: in admin mode, open the assistant and ask it to add a column.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Stream } from "effect";
import { assistantIoLive } from "./assistant-live.ts";

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
  const settings = {
    claudePath,
    workspaceDir: `${dir}/workspace`,
    sourceDir: `${dir}/src`,
    backgroundsDir: `${dir}/backgrounds`,
    unibrainUrl: "http://127.0.0.1:1/mcp",
  };

  const result = await Effect.runPromise(Effect.gen(function* () {
    const io = yield* assistantIoLive(settings);
    yield* io.writeWorkspaceLayout("{}\n");
    const before = yield* io.readWorkspaceLayout;
    const run = yield* Effect.scoped(Effect.gen(function* () {
      const agent = yield* io.startAgent("Add a column", "s0");
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
  const settings = {
    claudePath,
    workspaceDir: dir,
    sourceDir: dir,
    backgroundsDir: dir,
    unibrainUrl: "http://127.0.0.1:1/mcp",
  };

  const started = Date.now();
  const exit = await Effect.runPromise(Effect.gen(function* () {
    const io = yield* assistantIoLive(settings);
    const agent = yield* Effect.scoped(Effect.gen(function* () {
      const agent = yield* io.startAgent("Hi", null);
      yield* agent.stdout.pipe(Stream.take(1), Stream.runDrain);
      return agent;
    }));
    return yield* agent.exit;
  }));
  assertEquals(exit.code !== 0, true);
  assertEquals(Date.now() - started < 10_000, true);
  await Deno.remove(dir, { recursive: true });
});
