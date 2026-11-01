import { assertEquals } from "@std/assert";
import { adminButton, isActivation } from "./admin-button.ts";

const self = {};
const child = {};

Deno.test("isActivation accepts Enter and Space on the element itself", () => {
  const on = (key: string, target: object) =>
    isActivation({ key, target, currentTarget: self } as Parameters<typeof isActivation>[0]);
  assertEquals(on("Enter", self), true);
  assertEquals(on(" ", self), true);
  assertEquals(on("a", self), false);
  assertEquals(on("Enter", child), false);
});

Deno.test("adminButton adds button semantics only in admin mode", () => {
  assertEquals(adminButton(false, "Edit"), {});
  const props = adminButton(true, "Edit");
  assertEquals([props.role, props.tabIndex, props["aria-label"]], ["button", 0, "Edit"]);
});

Deno.test("adminButton clicks the element on Enter", () => {
  const props = adminButton(true, "Edit");
  let clicks = 0;
  let prevented = false;
  const element = { click: () => clicks++ };
  const event = (target: object) => ({
    key: "Enter",
    target,
    currentTarget: element,
    preventDefault: () => (prevented = true),
  });
  const press = props.onKeyDown as unknown as (e: ReturnType<typeof event>) => void;
  press(event(child));
  assertEquals([clicks, prevented], [0, false]);
  press(event(element));
  assertEquals([clicks, prevented], [1, true]);
});
