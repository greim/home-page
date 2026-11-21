import { assertEquals } from "@std/assert";
import {
  initialOpenState,
  isExpanded,
  openStateText,
  readOpenState,
  toggleCollapsed,
  toggleFolder,
} from "./open-state.ts";

Deno.test("a fresh browser has the list open and every folder closed", () => {
  assertEquals(readOpenState(null), initialOpenState);
  assertEquals(initialOpenState.collapsed, false);
  assertEquals(isExpanded(initialOpenState, "f"), false);
});

Deno.test("toggleFolder opens and closes only the target folder", () => {
  const one = toggleFolder(initialOpenState, "f");
  const two = toggleFolder(one, "g");
  assertEquals([isExpanded(two, "f"), isExpanded(two, "g")], [true, true]);
  const closed = toggleFolder(two, "f");
  assertEquals([isExpanded(closed, "f"), isExpanded(closed, "g")], [false, true]);
});

Deno.test("toggleCollapsed keeps the open folders", () => {
  const state = toggleFolder(initialOpenState, "f");
  const collapsed = toggleCollapsed(state);
  assertEquals(collapsed, { collapsed: true, expanded: ["f"] });
  assertEquals(toggleCollapsed(collapsed), state);
});

Deno.test("state round-trips through its text", () => {
  const state = toggleCollapsed(toggleFolder(initialOpenState, "f"));
  assertEquals(readOpenState(openStateText(state)), state);
});

Deno.test("unreadable stored state falls back to the initial one", () => {
  for (
    const text of ["", "nope", "[]", '{"collapsed":"yes","expanded":[]}', '{"collapsed":true}']
  ) {
    assertEquals(readOpenState(text), initialOpenState);
  }
});
