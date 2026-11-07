import { assertEquals, assertStringIncludes } from "@std/assert";
import { Schema } from "effect";
import { Registry } from "../common/widgets.ts";
import {
  type AgentSettings,
  conflictPrompt,
  describeRegistry,
  instructions,
  invalidLayoutPrompt,
  sessionOptions,
  userPrompt,
  workspaceLayoutPath,
} from "./assistant-agent.ts";

const settings: AgentSettings = { repoDir: "/repo/", workspaceDir: "/repo/data/assistant" };

const registry = Schema.decodeUnknownSync(Registry)({
  widgets: [{
    id: "clock",
    title: "Clock",
    description: "Shows the time.",
    version: "v1",
    configSchema: { type: "object" },
    defaultConfig: { zone: "local" },
  }],
});

Deno.test("the agent works in the repo with the developer's own settings, as in a terminal", () => {
  const options = sessionOptions(settings, null, null);
  assertEquals(options.cwd, "/repo/");
  assertEquals(options.settingSources, ["user", "project", "local"]);
  assertEquals(options.systemPrompt.preset, "claude_code");
  assertEquals("resume" in options, false);
  // Text streams as the agent writes it.
  assertEquals(options.includePartialMessages, true);
});

Deno.test("every session starts in default mode, resumed ones too", () => {
  assertEquals(sessionOptions(settings, null, null).permissionMode, "default");
  // Unless the user chose a mode before the conversation's first message.
  assertEquals(sessionOptions(settings, null, null, "plan").permissionMode, "plan");
  const resumed = sessionOptions(settings, "s1", null);
  assertEquals(resumed.permissionMode, "default");
  assertEquals("resume" in resumed && resumed.resume, "s1");
});

Deno.test("only the agent's own layout copy may be edited without asking", () => {
  assertEquals(workspaceLayoutPath(settings), "data/assistant/layout.json");
  assertEquals(sessionOptions(settings, null, null).allowedTools, [
    "Edit(./data/assistant/layout.json)",
  ]);
});

Deno.test("instructions describe the page and list the widget types", () => {
  const text = instructions(settings, registry);
  assertStringIncludes(text, "data/assistant/layout.json is a copy of the live layout");
  assertStringIncludes(text, "src/common/model.ts");
  assertStringIncludes(text, "deno task build");
  assertStringIncludes(text, '"clock": Clock. Shows the time.');
  assertStringIncludes(instructions(settings, null), "The registry couldn't be read");
});

Deno.test("the registry is listed with each type's config schema and default config", () => {
  assertEquals(
    describeRegistry(registry),
    `- "clock": Clock. Shows the time.
  Config JSON Schema: {"type":"object"}
  A new widget's config: {"zone":"local"}`,
  );
});

Deno.test("a message is prefixed with notes on what the app prepared", () => {
  assertEquals(userPrompt("Hi", { resumed: false, screenshot: false }, settings), "Hi");
  assertEquals(
    userPrompt("Hi", { resumed: true, screenshot: true }, settings),
    "[app note] data/assistant/layout.json was refreshed from the live page.\n" +
      "[app note] data/assistant/screenshot.jpg shows the page as the user saw it just now.\n\nHi",
  );
});

Deno.test("prompts tell the agent what the app did with its layout", () => {
  assertStringIncludes(
    invalidLayoutPrompt(settings, "columns: expected an array"),
    "data/assistant/layout.json was NOT applied: it failed validation.\n\ncolumns: expected an array",
  );
  assertStringIncludes(conflictPrompt(settings), "the live layout changed while you were working");
});

Deno.test("a workspace outside the repo is referred to by its full path", () => {
  assertEquals(
    workspaceLayoutPath({ repoDir: "/repo", workspaceDir: "/tmp/ws/" }),
    "/tmp/ws/layout.json",
  );
});
