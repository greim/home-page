import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  agentArgs,
  type AgentSettings,
  conflictPrompt,
  describeRegistry,
  instructions,
  invalidLayoutPrompt,
  userPrompt,
  widgetChecksFailedPrompt,
} from "./assistant-agent.ts";
import type { Registry } from "../common/widgets.ts";

const settings: AgentSettings = {
  claudePath: "/bin/claude",
  workspaceDir: "/repo/data/assistant",
  repoDir: "/repo",
  widgetsDir: "/repo/src/client/widgets",
  secretsDir: "/repo/.secrets",
  backgroundsDir: "/repo/data/backgrounds",
};

const registry: Registry = {
  widgets: [{
    id: "clock",
    title: "Clock",
    description: "Shows the time.",
    version: "abc",
    configSchema: { type: "object" },
    defaultConfig: { timeZone: null },
  }],
};

const valueAfter = (args: ReadonlyArray<string>, flag: string) => args.at(args.indexOf(flag) + 1);

Deno.test("the agent may edit only its layout copy and the widget source, with no shell or MCP servers", () => {
  const args = agentArgs(settings, null, registry);
  assert(args.includes("--restricted"));
  assert(args.includes("--strict-mcp-config"));
  assertEquals(args.includes("--mcp-config"), false);
  assertEquals(valueAfter(args, "--tools"), "Read,Write,Edit,Glob,Grep,WebFetch,WebSearch");
  assertEquals(valueAfter(args, "--permission-mode"), "dontAsk");
  assertEquals(
    valueAfter(args, "--allowedTools"),
    "Read Glob Grep WebFetch WebSearch Edit(./layout.json) Edit(//repo/src/client/widgets/**)",
  );
  assertEquals(valueAfter(args, "--disallowedTools"), "Read(//repo/.secrets/**)");
  assertEquals(args.slice(args.indexOf("--add-dir") + 1, args.indexOf("--add-dir") + 3), [
    settings.repoDir,
    settings.backgroundsDir,
  ]);
  assertEquals(valueAfter(args, "--append-system-prompt"), instructions(settings, registry));
  assertEquals(valueAfter(args, "--output-format"), "stream-json");
  assert(args.includes("--verbose"));
});

Deno.test("a conversation is resumed by session id", () => {
  assertEquals(agentArgs(settings, null, null).includes("--resume"), false);
  assertEquals(valueAfter(agentArgs(settings, "s1", null), "--resume"), "s1");
});

Deno.test("instructions point the agent at its references and list the widget types", () => {
  const text = instructions(settings, registry);
  assertStringIncludes(text, settings.repoDir);
  assertStringIncludes(text, settings.widgetsDir);
  assertStringIncludes(text, settings.backgroundsDir);
  assertStringIncludes(text, "SELF_BUILDING.md");
  assertStringIncludes(text, "reload the page");
  assertStringIncludes(text, "screenshot.jpg");
  assertStringIncludes(text, "skin");
  assertStringIncludes(text, "fonts.google.com");
  assertStringIncludes(text, describeRegistry(registry));
  assertEquals(text.toLowerCase().includes("unibrain"), false);
});

Deno.test("the registry is listed with each type's config schema and default config", () => {
  assertEquals(
    describeRegistry(registry),
    `- "clock": Clock. Shows the time.
  Config JSON Schema: {"type":"object"}
  A new widget's config: {"timeZone":null}`,
  );
  assertStringIncludes(describeRegistry(null), "couldn't be read");
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
  assertStringIncludes(widgetChecksFailedPrompt("Lint failed"), "Lint failed");
  assertStringIncludes(widgetChecksFailedPrompt("x"), "nothing was applied");
});
