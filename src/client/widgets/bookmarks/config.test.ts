import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import { BookmarksConfig, toggleCollapsed, toggleFolder } from "./config.ts";

const config: BookmarksConfig = {
  heading: "Links",
  collapsed: false,
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

Deno.test("toggleCollapsed opens and closes the whole widget, keeping the rest", () => {
  assertEquals(toggleCollapsed(config), { ...config, collapsed: true });
  assertEquals(toggleCollapsed(toggleCollapsed(config)), config);
});

Deno.test("toggleFolder keeps the heading and collapse state", () => {
  const toggled = toggleFolder({ ...config, collapsed: true }, "f");
  assertEquals([toggled.heading, toggled.collapsed], ["Links", true]);
});

Deno.test("configs saved without a heading have none, and are open", () => {
  assertEquals(
    Schema.decodeUnknownEither(BookmarksConfig)({ items: [] }),
    Either.right({ heading: "", collapsed: false, items: [] }),
  );
});
