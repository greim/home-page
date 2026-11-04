/**
 * Integration test of the framework's two halves: bundles a real MFE, loads it
 * with a real import(), and exchanges messages with it both ways.
 */
import { assertEquals } from "@std/assert";
import { createManager } from "./manager-live.ts";

const fixture = new URL("../../../tooling/fixtures/widgets/echo/main.tsx", import.meta.url);

Deno.test("the manager loads a real MFE bundle and talks with it both ways", async () => {
  const outDir = await Deno.makeTempDir();
  const result = await Deno.bundle({
    entrypoints: [fixture.pathname],
    outputDir: outDir,
    platform: "browser",
    format: "esm",
    write: true,
  });
  assertEquals(result.errors, []);
  const resolved: Array<string> = [];
  const manager = createManager({
    resolver: (mfe) => {
      resolved.push(mfe);
      return new URL(`file://${outDir}/main.js`).href;
    },
  });
  manager.receive("echo", "answer", (message) => `the shell heard ${message}`);

  assertEquals(await manager.send({ mfe: "echo", channel: "echo", message: "hi" }), {
    ok: true,
    value: { echoed: "hi" },
  });
  // The MFE relays this to the shell's "answer" handler, and passes back its reply.
  assertEquals(await manager.send({ mfe: "echo", channel: "ask-shell", message: "42" }), {
    ok: true,
    value: { ok: true, value: "the shell heard 42" },
  });
  assertEquals(resolved, ["echo"]);
  await Deno.remove(outDir, { recursive: true });
});
