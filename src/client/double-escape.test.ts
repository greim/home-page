import { assertEquals } from "@std/assert";
import { doubleEscapeWindowMs, initialEscapeState, onEscape } from "./double-escape.ts";

Deno.test("a single Escape doesn't toggle", () => {
  assertEquals(onEscape(initialEscapeState, 1000), {
    state: { lastEscapeAt: 1000 },
    toggle: false,
  });
});

Deno.test("two quick Escapes toggle and reset", () => {
  const first = onEscape(initialEscapeState, 1000);
  assertEquals(onEscape(first.state, 1000 + doubleEscapeWindowMs), {
    state: initialEscapeState,
    toggle: true,
  });
});

Deno.test("two slow Escapes don't toggle", () => {
  const first = onEscape(initialEscapeState, 1000);
  assertEquals(onEscape(first.state, 1001 + doubleEscapeWindowMs), {
    state: { lastEscapeAt: 1001 + doubleEscapeWindowMs },
    toggle: false,
  });
});

Deno.test("a triple press toggles once, then starts over", () => {
  const a = onEscape(initialEscapeState, 0);
  const b = onEscape(a.state, 100);
  const c = onEscape(b.state, 200);
  assertEquals([a.toggle, b.toggle, c.toggle], [false, true, false]);
});
