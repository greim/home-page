import { assertEquals } from "@std/assert";
import { canRestore, diffLines, versionDate } from "./history-view.ts";

Deno.test("a version's date drops the year only when it's this one", () => {
  const now = new Date(2026, 10, 21);
  assertEquals(versionDate(new Date(2026, 9, 3, 15, 28).toISOString(), now), "Oct 3, 3:28 PM");
  assertEquals(
    versionDate(new Date(2025, 11, 31, 9, 5).toISOString(), now),
    "Dec 31, 2025, 9:05 AM",
  );
  assertEquals(versionDate("not a date", now), "not a date");
});

Deno.test("a version can be restored only over a clean layout, and not the one it already is", () => {
  assertEquals(canRestore(1, "clean", false), { ok: true });
  assertEquals(canRestore(0, "clean", false).ok, false);
  assertEquals(canRestore(1, "modified", false), {
    ok: false,
    reason: "Accept or discard your current changes first.",
  });
  assertEquals(canRestore(1, "new", false).ok, false);
  assertEquals(canRestore(1, null, false).ok, false);
  assertEquals(canRestore(1, "clean", true), { ok: false, reason: "Working…" });
  // Changes pending on top of the newest version: it can't be restored over them either.
  assertEquals(canRestore(0, "modified", false).ok, false);
});

Deno.test("a diff's lines are classified, without git's file headers", () => {
  const diff = [
    "diff --git a/layout.json b/layout.json",
    "index 1a2b3c..4d5e6f 100644",
    "--- a/layout.json",
    "+++ b/layout.json",
    "@@ -1,3 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "",
  ].join("\n");
  assertEquals(diffLines(diff), [
    { kind: "hunk", text: "@@ -1,3 +1,3 @@" },
    { kind: "context", text: " keep" },
    { kind: "removed", text: "-old" },
    { kind: "added", text: "+new" },
  ]);
  assertEquals(diffLines(""), []);
});
