import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import {
  Capability,
  defaultInputTraits,
  grants,
  riskyCombination,
  traits,
} from "./agent-capabilities.ts";

const search: Capability = { use: "web-search", policy: "auto" };
const fetchAsk: Capability = { use: "web-fetch", policy: "ask" };
const fetchAuto: Capability = { use: "web-fetch", policy: "auto" };
const files: Capability = { use: "files" };
const sheetTools: Capability = { use: "widget-tools", policy: "auto", does: "Edits the sheet" };
const gmail = (overrides: Partial<Extract<Capability, { use: "mcp" }>> = {}): Capability => ({
  use: "mcp",
  server: "gmail",
  tools: ["search_threads", "get_thread"],
  policy: "auto",
  service: "Gmail",
  reads: "private",
  sends: false,
  does: "Reads your email",
  ...overrides,
});

Deno.test("each capability gives its own tools, by Claude Code's names", () => {
  assertEquals(traits(search).builtIn, ["WebSearch"]);
  assertEquals(traits(files).toolNames, ["Read", "Write", "Edit", "Glob", "Grep"]);
  assertEquals(traits(gmail()).toolNames, ["mcp__gmail__search_threads", "mcp__gmail__get_thread"]);
  assertEquals(traits(gmail()).builtIn, []);
  assertEquals(traits(sheetTools).toolNames, ["mcp__widget__*"]);
});

Deno.test("a capability grants exactly its tools", () => {
  assertEquals(grants(gmail(), "mcp__gmail__get_thread"), true);
  assertEquals(grants(gmail(), "mcp__gmail__send_message"), false);
  assertEquals(grants(sheetTools, "mcp__widget__apply_changes"), true);
  assertEquals(grants(sheetTools, "mcp__other__x"), false);
  assertEquals(grants(fetchAsk, "WebSearch"), false);
});

Deno.test("what a capability touches", () => {
  assertEquals([traits(search).reads, traits(search).sends, traits(search).auto], [
    "untrusted",
    true,
    true,
  ]);
  assertEquals([traits(fetchAsk).auto, traits(files).auto, traits(files).sends], [
    false,
    true,
    false,
  ]);
  assertEquals(traits(sheetTools).reads, "private");
});

Deno.test("private data, untrusted content and an automatic way out together are refused", () => {
  // An email checker that could send, without asking.
  const mail = [gmail(), gmail({ tools: ["send"], sends: true, reads: "untrusted" })];
  assertStringIncludes(riskyCombination(defaultInputTraits, mail) ?? "", "Reads your email");
  // A researcher given private notes, fetching pages without asking.
  assertStringIncludes(
    riskyCombination({ private: true, untrusted: false }, [search, fetchAuto]) ?? "",
    "Searches the web; Reads web pages it chooses",
  );
});

Deno.test("any one of the three missing makes it safe enough", () => {
  // No private data: a researcher given only a topic.
  assertEquals(
    riskyCombination({ private: false, untrusted: false }, [search, fetchAuto]),
    null,
  );
  // No way out: a spreadsheet fixer.
  assertEquals(riskyCombination(defaultInputTraits, [files, sheetTools]), null);
  // The way out asks.
  assertEquals(
    riskyCombination(defaultInputTraits, [
      gmail(),
      gmail({ tools: ["send"], sends: true, policy: "ask" }),
    ]),
    null,
  );
  // No untrusted content: reading the user's own mail they wrote themselves, and sending.
  assertEquals(
    riskyCombination({ private: true, untrusted: false }, [gmail({ sends: true })]),
    null,
  );
});

Deno.test("an MCP capability can't use the widget's own tool server's name", () => {
  const decode = (server: string) =>
    Either.isRight(Schema.decodeUnknownEither(Capability)({ ...gmail(), server }));
  assertEquals(decode("gmail"), true);
  assertEquals(decode("widget"), false);
});
