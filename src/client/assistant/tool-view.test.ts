import { assertEquals } from "@std/assert";
import { diffRows, toolView } from "./tool-view.ts";

Deno.test("an edit shows as a line diff, relative to the repo", () => {
  assertEquals(
    toolView(
      "Edit",
      { file_path: "/repo/a.ts", old_string: "a\nb\n", new_string: "a\nc\n" },
      "/repo",
    ),
    {
      is: "diff",
      path: "a.ts",
      rows: [
        { kind: "same", text: "a" },
        { kind: "removed", text: "b" },
        { kind: "added", text: "c" },
      ],
    },
  );
});

Deno.test("a new file shows as all added lines", () => {
  assertEquals(toolView("Write", { file_path: "/x/n.md", content: "one\ntwo" }), {
    is: "diff",
    path: "/x/n.md",
    rows: [{ kind: "added", text: "one" }, { kind: "added", text: "two" }],
  });
});

Deno.test("a command shows as itself; anything else as its JSON", () => {
  assertEquals(toolView("Bash", { command: "git status" }), {
    is: "command",
    command: "git status",
  });
  assertEquals(toolView("Grep", { pattern: "x" }), { is: "json", text: '{\n  "pattern": "x"\n}' });
  // Without the fields it needs, an edit shows as JSON too.
  assertEquals(toolView("Edit", { other: 1 }).is, "json");
});

Deno.test("unchanged lines far from any change are elided", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  const after = before.replace("line 10", "LINE 10");
  const rows = diffRows(before, after);
  assertEquals(rows.map((r) => r.kind === "same" ? r.text : `${r.kind}: ${r.text}`), [
    "…",
    "line 7",
    "line 8",
    "line 9",
    "removed: line 10",
    "added: LINE 10",
    "line 11",
    "line 12",
    "line 13",
    "…",
  ]);
});
