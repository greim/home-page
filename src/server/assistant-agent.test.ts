import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  agentArgs,
  type AgentSettings,
  conflictPrompt,
  instructions,
  invalidLayoutPrompt,
  userPrompt,
} from "./assistant-agent.ts";

const settings: AgentSettings = {
  claudePath: "/bin/claude",
  workspaceDir: "/repo/data/assistant",
  sourceDir: "/repo/src",
  backgroundsDir: "/repo/data/backgrounds",
  unibrainUrl: "http://127.0.0.1:7420/mcp",
};

const valueAfter = (args: ReadonlyArray<string>, flag: string) => args.at(args.indexOf(flag) + 1);

Deno.test("the agent is confined to editing its layout copy, with Unibrain as its only MCP server", () => {
  const args = agentArgs(settings, null);
  assert(args.includes("--restricted"));
  assert(args.includes("--strict-mcp-config"));
  assertEquals(valueAfter(args, "--tools"), "Read,Write,Edit,Glob,Grep");
  assertEquals(valueAfter(args, "--permission-mode"), "dontAsk");
  assertEquals(
    valueAfter(args, "--allowedTools"),
    "Read Glob Grep Edit(./layout.json) Write(./layout.json) mcp__unibrain",
  );
  assertEquals(
    JSON.parse(valueAfter(args, "--mcp-config") ?? ""),
    { mcpServers: { unibrain: { type: "http", url: settings.unibrainUrl } } },
  );
  assertEquals(args.slice(args.indexOf("--add-dir") + 1, args.indexOf("--add-dir") + 3), [
    settings.sourceDir,
    settings.backgroundsDir,
  ]);
  assertEquals(valueAfter(args, "--append-system-prompt"), instructions(settings));
  assertEquals(valueAfter(args, "--output-format"), "stream-json");
  assert(args.includes("--verbose"));
});

Deno.test("a conversation is resumed by session id", () => {
  assertEquals(agentArgs(settings, null).includes("--resume"), false);
  assertEquals(valueAfter(agentArgs(settings, "s1"), "--resume"), "s1");
});

Deno.test("instructions point the agent at its references and at Unibrain", () => {
  const text = instructions(settings);
  assertStringIncludes(text, settings.sourceDir);
  assertStringIncludes(text, settings.backgroundsDir);
  assertStringIncludes(text, "search Unibrain");
  assertStringIncludes(text, "unibrain_safe_execute");
  assertStringIncludes(text, "screenshot.jpg");
  assertStringIncludes(text, "skin");
  assertStringIncludes(text, "fonts.google.com");
});

Deno.test("prompts tell the agent what the app did with its layout", () => {
  assertEquals(userPrompt("Hi", { resumed: false, screenshot: false }), "Hi");
  assertEquals(
    userPrompt("Hi", { resumed: true, screenshot: false }),
    "[app] layout.json was refreshed from the live page.\n\nHi",
  );
  assertEquals(
    userPrompt("Hi", { resumed: false, screenshot: true }),
    "[app] screenshot.jpg shows the page as the user saw it just now.\n\nHi",
  );
  assertEquals(
    userPrompt("Hi", { resumed: true, screenshot: true }),
    "[app] layout.json was refreshed from the live page.\n" +
      "[app] screenshot.jpg shows the page as the user saw it just now.\n\nHi",
  );
  assertStringIncludes(invalidLayoutPrompt("Expected string"), "Expected string");
  assertStringIncludes(invalidLayoutPrompt("x"), "NOT applied");
  assertStringIncludes(conflictPrompt, "NOT applied");
});
