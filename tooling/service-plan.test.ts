import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe } from "./plan.ts";
import {
  installPlan,
  parseServiceNames,
  plist,
  restartPlan,
  serverArgs,
  uninstallPlan,
} from "./service-plan.ts";

const settings = {
  uid: 501,
  home: "/Users/me",
  denoPath: "/bin/deno",
  repoRoot: "/repo/",
  serverEntry: "/repo/src/server/main.ts",
  assistantEntry: "/repo/src/server/assistant-main.ts",
  logsDir: "/repo/logs",
  dataDir: "/repo/data",
  path: "/Users/me/.deno/bin:/usr/bin:/bin",
};

Deno.test("each plist keeps its server alive and logs to the repo", () => {
  const app = plist(settings, "app");
  assertStringIncludes(app, "<key>KeepAlive</key><true/>");
  assertStringIncludes(app, "<key>RunAtLoad</key><true/>");
  assertStringIncludes(app, "<string>local.home-page</string>");
  assertStringIncludes(app, "<string>/repo/src/server/main.ts</string>");
  assertStringIncludes(app, "<string>/repo/logs/server.log</string>");
  const assistant = plist(settings, "assistant");
  assertStringIncludes(assistant, "<string>local.home-page.assistant</string>");
  assertStringIncludes(assistant, "<string>/repo/src/server/assistant-main.ts</string>");
  assertStringIncludes(assistant, "<string>/repo/logs/assistant.log</string>");
});

Deno.test("only the assistant service may ask the OS for system info (the SDK needs it)", () => {
  assertEquals(serverArgs(settings, "app").includes("--allow-sys"), false);
  assertEquals(serverArgs(settings, "assistant").includes("--allow-sys"), true);
  assertEquals(serverArgs(settings, "assistant").includes("--allow-write=/repo/data"), true);
});

Deno.test("plists pass on the installing shell's PATH, for the commands the agent runs", () => {
  assertStringIncludes(
    plist(settings, "assistant"),
    "<key>PATH</key><string>/Users/me/.deno/bin:/usr/bin:/bin</string>",
  );
});

Deno.test("plist escapes XML special characters", () => {
  assertStringIncludes(
    plist({ ...settings, home: "/Users/a&b<c>" }, "app"),
    "/Users/a&amp;b&lt;c&gt;",
  );
});

Deno.test("installPlan writes both plists and (re)bootstraps both agents", () => {
  const steps = installPlan(settings).map(describe);
  assertEquals(steps.filter((s) => !s.startsWith("/bin/sh")), [
    "mkdir /repo/logs",
    "mkdir /Users/me/Library/LaunchAgents",
    "write /Users/me/Library/LaunchAgents/local.home-page.plist",
    "launchctl bootout gui/501/local.home-page",
    "launchctl bootstrap gui/501 /Users/me/Library/LaunchAgents/local.home-page.plist",
    "write /Users/me/Library/LaunchAgents/local.home-page.assistant.plist",
    "launchctl bootout gui/501/local.home-page.assistant",
    "launchctl bootstrap gui/501 /Users/me/Library/LaunchAgents/local.home-page.assistant.plist",
  ]);
});

Deno.test("installPlan waits for launchd to finish removing each agent before bootstrapping it", () => {
  const steps = installPlan(settings).map(describe);
  for (const label of ["local.home-page", "local.home-page.assistant"]) {
    const removed = steps.findIndex((s) =>
      s.startsWith("/bin/sh") && s.includes(`launchctl print gui/501/${label} `)
    );
    assertEquals(steps[removed - 1], `launchctl bootout gui/501/${label}`);
    assertStringIncludes(
      steps[removed + 1] ?? "",
      `bootstrap gui/501 /Users/me/Library/LaunchAgents/${label}.plist`,
    );
  }
});

Deno.test("uninstallPlan boots out both agents and removes their plists", () => {
  assertEquals(uninstallPlan(settings).map(describe), [
    "launchctl bootout gui/501/local.home-page",
    "rm /Users/me/Library/LaunchAgents/local.home-page.plist",
    "launchctl bootout gui/501/local.home-page.assistant",
    "rm /Users/me/Library/LaunchAgents/local.home-page.assistant.plist",
  ]);
});

Deno.test("restartPlan kickstarts the named agents", () => {
  assertEquals(restartPlan(501, ["assistant"]).map(describe), [
    "launchctl kickstart -k gui/501/local.home-page.assistant",
  ]);
});

Deno.test("restart-service restarts both services unless told which", () => {
  assertEquals(parseServiceNames([]), { ok: true, names: ["app", "assistant"] });
  assertEquals(parseServiceNames(["assistant", "app"]), { ok: true, names: ["app", "assistant"] });
  assertEquals(parseServiceNames(["app"]), { ok: true, names: ["app"] });
  assertEquals(parseServiceNames(["web"]), {
    ok: false,
    message: "Unknown service web: expected app or assistant",
  });
});
