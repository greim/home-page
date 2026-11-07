import { assertEquals } from "@std/assert";
import { changedFiles, noRestarts, restartsFor } from "./restarts.ts";

const graphs = {
  app: new Set(["src/server/main.ts", "src/server/routes.ts", "src/common/model.ts"]),
  page: new Set(["src/client/main.tsx", "src/client/app.tsx", "src/common/model.ts"]),
  assistant: new Set([
    "src/server/assistant-main.ts",
    "src/server/assistant.ts",
    "src/common/model.ts",
  ]),
};

const restarts = (...files: ReadonlyArray<string>) => restartsFor(new Set(files), graphs);

Deno.test("files are changed when added, removed or edited", () => {
  const before = new Map([["a", "1"], ["b", "2"], ["c", "3"]]);
  const after = new Map([["a", "1"], ["b", "9"], ["d", "4"]]);
  assertEquals([...changedFiles(before, after)].sort(), ["b", "c", "d"]);
  assertEquals(changedFiles(before, before).size, 0);
});

Deno.test("server code restarts the main server", () => {
  assertEquals(restarts("src/server/routes.ts"), { app: true, assistant: false, reload: false });
});

Deno.test("the page's code restarts the main server (which bundles it), then reloads", () => {
  assertEquals(restarts("src/client/app.tsx"), { app: true, assistant: false, reload: true });
});

Deno.test("widget code only needs a reload: its build is served from disk", () => {
  assertEquals(restarts("src/client/widgets/clock/main.tsx"), {
    app: false,
    assistant: false,
    reload: true,
  });
});

Deno.test("the assistant service's own code restarts it", () => {
  assertEquals(restarts("src/server/assistant.ts"), { app: false, assistant: true, reload: false });
});

Deno.test("a module both use restarts both, and reloads the page it's in", () => {
  assertEquals(restarts("src/common/model.ts"), { app: true, assistant: true, reload: true });
});

Deno.test("dependencies can change anything", () => {
  assertEquals(restarts("deno.lock"), { app: true, assistant: true, reload: true });
});

Deno.test("anything else needs nothing", () => {
  assertEquals(restarts("README.md", "data/layout.json", ".claude/skills/x/SKILL.md"), noRestarts);
  assertEquals(restarts(), noRestarts);
});
