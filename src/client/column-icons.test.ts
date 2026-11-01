import { assertEquals } from "@std/assert";
import { defaultColumnIcon } from "../common/model.ts";
import { iconEntries, iconLabel, pickIcon, searchIcons } from "./column-icons.ts";

Deno.test("iconLabel splits export names into lowercase words", () => {
  assertEquals(iconLabel("LuArrowBigDown"), "arrow big down");
  assertEquals(iconLabel("LuColumns3"), "columns 3");
  assertEquals(iconLabel("LuBadgeX"), "badge x");
  assertEquals(iconLabel("Lu3dRotate"), "3d rotate");
  assertEquals(iconLabel("LuHouse"), "house");
  assertEquals(iconLabel("LuHeading1"), "heading 1");
});

const entries = iconEntries(["LuStarOff", "LuHouse", "LuStar", "LuSparkles", "LuMoonStar"]);

Deno.test("iconEntries sorts by label", () => {
  assertEquals(entries.map((e) => e.label), [
    "house",
    "moon star",
    "sparkles",
    "star",
    "star off",
  ]);
});

Deno.test("searchIcons matches every word and ranks leading matches first", () => {
  assertEquals(searchIcons(entries, "  STAR ").map((e) => e.name), [
    "LuStar",
    "LuStarOff",
    "LuMoonStar",
  ]);
  assertEquals(searchIcons(entries, "off star").map((e) => e.name), ["LuStarOff"]);
  assertEquals(searchIcons(entries, "zebra"), []);
});

Deno.test("searchIcons with an empty query returns everything in order", () => {
  assertEquals(searchIcons(entries, " "), entries);
});

Deno.test("pickIcon maps [0, 1) across the names", () => {
  const names = ["LuA", "LuB", "LuC"];
  assertEquals(pickIcon(names, 0), "LuA");
  assertEquals(pickIcon(names, 0.5), "LuB");
  assertEquals(pickIcon(names, 0.999), "LuC");
  assertEquals(pickIcon([], 0.5), defaultColumnIcon);
});
