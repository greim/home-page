import { assertEquals } from "@std/assert";
import { attachProblem, matchingCommands, maxSuggestions, withCommand } from "./composer.ts";

const command = (name: string) => ({ name, description: `${name} it`, argumentHint: "" });
const commands = ["compact", "code-review", "testing", "context", "clear"].map(command);

Deno.test("commands are offered while a slash and part of a name is typed, prefix matches first", () => {
  assertEquals(matchingCommands("/c", commands).map((c) => c.name), [
    "compact",
    "code-review",
    "context",
    "clear",
  ]);
  assertEquals(matchingCommands("/te", commands).map((c) => c.name), ["testing", "context"]);
  assertEquals(matchingCommands("/", commands).length, commands.length);
});

Deno.test("no commands are offered once it's not a lone command name", () => {
  assertEquals(matchingCommands("compact", commands), []);
  assertEquals(matchingCommands("/compact now", commands), []);
  assertEquals(matchingCommands("", commands), []);
});

Deno.test("only a few commands are offered at once", () => {
  const many = Array.from({ length: 20 }, (_, i) => command(`c${i}`));
  assertEquals(matchingCommands("/c", many).length, maxSuggestions);
});

Deno.test("picking a command fills it in, ready for its arguments", () => {
  assertEquals(withCommand(command("compact")), "/compact ");
});

Deno.test("only images Claude reads, of a size it takes, can be attached", () => {
  assertEquals(attachProblem({ type: "image/png", size: 1000, name: "a.png" }), null);
  assertEquals(
    attachProblem({ type: "application/pdf", size: 1000, name: "a.pdf" }),
    "a.pdf isn't a PNG, JPEG, GIF or WebP image.",
  );
  assertEquals(
    attachProblem({ type: "image/jpeg", size: 6 * 1024 * 1024, name: "" }),
    "That image is over 5 MB.",
  );
});
