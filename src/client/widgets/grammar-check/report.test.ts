import { assertEquals } from "@std/assert";
import { applySuggestion, excerptRange, formatCost, type Issue } from "./report.ts";

const issue = (excerpt: string, suggestion: string): Issue => ({
  excerpt,
  suggestion,
  kind: "spelling",
  problem: "Misspelled.",
});

Deno.test("a suggestion replaces the first place its excerpt appears", () => {
  assertEquals(
    applySuggestion("Teh cat and teh dog.", issue("Teh cat", "The cat")),
    "The cat and teh dog.",
  );
});

Deno.test("a suggestion whose excerpt isn't in the text can't be applied", () => {
  assertEquals(applySuggestion("The cat.", issue("Teh", "The")), null);
  assertEquals(applySuggestion("The cat.", issue("", "x")), null);
});

Deno.test("an excerpt is found where it first appears, if it's there", () => {
  assertEquals(excerptRange("Teh cat and teh dog.", issue("teh", "the")), { start: 12, end: 15 });
  assertEquals(excerptRange("The cat.", issue("Teh", "The")), null);
  assertEquals(excerptRange("The cat.", issue("", "x")), null);
});

Deno.test("a cost is shown in dollars, with more places when it's tiny", () => {
  assertEquals(formatCost(0.0123), "$0.012");
  assertEquals(formatCost(0.0042), "$0.0042");
});
