import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe } from "./plan.ts";
import { installPlan, plist, plistPath, uninstallPlan } from "./service-plan.ts";

const settings = {
  uid: 501,
  home: "/Users/me",
  denoPath: "/bin/deno",
  repoRoot: "/repo/",
  serverEntry: "/repo/src/server/main.ts",
  logsDir: "/repo/logs",
  dataDir: "/repo/data",
  claudePath: "/Users/me/.local/bin/claude",
};

Deno.test("plist keeps the server alive and logs to the repo", () => {
  const xml = plist(settings);
  assertStringIncludes(xml, "<key>KeepAlive</key><true/>");
  assertStringIncludes(xml, "<key>RunAtLoad</key><true/>");
  assertStringIncludes(xml, "<string>--allow-net</string>");
  assertStringIncludes(xml, "<string>/repo/logs/server.log</string>");
});

Deno.test("plist tells the server where claude is", () => {
  assertStringIncludes(
    plist(settings),
    "<key>CLAUDE_PATH</key><string>/Users/me/.local/bin/claude</string>",
  );
});

Deno.test("plist escapes XML special characters", () => {
  assertStringIncludes(plist({ ...settings, home: "/Users/a&b<c>" }), "/Users/a&amp;b&lt;c&gt;");
});

Deno.test("installPlan writes the plist and (re)bootstraps the agent", () => {
  assertEquals(installPlan(settings).map(describe), [
    "mkdir /repo/logs",
    "mkdir /Users/me/Library/LaunchAgents",
    `write ${plistPath("/Users/me")}`,
    "launchctl bootout gui/501/local.home-page",
    "launchctl bootstrap gui/501 /Users/me/Library/LaunchAgents/local.home-page.plist",
  ]);
});

Deno.test("uninstallPlan boots out the agent and removes the plist", () => {
  assertEquals(uninstallPlan(settings).map(describe), [
    "launchctl bootout gui/501/local.home-page",
    "rm /Users/me/Library/LaunchAgents/local.home-page.plist",
  ]);
});
