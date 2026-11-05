import { assertEquals } from "@std/assert";
import { type BookmarksConfig, toggleFolder } from "./config.ts";

const config: BookmarksConfig = {
  items: [
    { is: "link", id: "l", label: "Top", url: "https://top.test" },
    { is: "folder", id: "f", label: "F", expanded: false, children: [] },
    { is: "folder", id: "g", label: "G", expanded: true, children: [] },
  ],
};

Deno.test("toggleFolder flips only the target folder", () => {
  const toggled = toggleFolder(config, "f");
  assertEquals(toggled.items.map((n) => n.is === "folder" ? n.expanded : null), [
    null,
    true,
    true,
  ]);
});

Deno.test("toggleFolder ignores links and unknown ids", () => {
  assertEquals(toggleFolder(config, "l"), config);
  assertEquals(toggleFolder(config, "nope"), config);
});
