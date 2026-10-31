import { assertEquals } from "@std/assert";
import { parseOutline, serializeOutline } from "./bookmark-outline.ts";
import type { BookmarkNode } from "./model.ts";

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};

const items: ReadonlyArray<BookmarkNode> = [
  { is: "link", id: "id1", label: "Mail", url: "https://mail.test/" },
  {
    is: "folder",
    id: "id2",
    label: "Dev",
    expanded: true,
    children: [
      { is: "link", id: "id3", label: "Repo | main", url: "https://git.test/" },
    ],
  },
];

const text = [
  "Mail | https://mail.test/",
  "Dev",
  "  Repo | main | https://git.test/",
].join("\n");

Deno.test("serializeOutline writes links and indented folder children", () => {
  assertEquals(serializeOutline(items), text);
});

Deno.test("parseOutline round-trips and preserves folder expansion", () => {
  assertEquals(parseOutline(text, items, counter()), { ok: true, items });
});

Deno.test("parseOutline rejects invalid URLs", () => {
  assertEquals(parseOutline("A | nope", [], counter()), {
    ok: false,
    errorMessage: "Line 1: not a valid URL: nope",
  });
});

Deno.test("parseOutline collapses new folders and skips blank lines", () => {
  assertEquals(parseOutline("\nNew\n\n\tA | https://a.test", [], counter()), {
    ok: true,
    items: [{
      is: "folder",
      id: "id1",
      label: "New",
      expanded: false,
      children: [{ is: "link", id: "id2", label: "A", url: "https://a.test" }],
    }],
  });
});

Deno.test("parseOutline rejects nested folders", () => {
  assertEquals(parseOutline("F\n  G", [], counter()).ok, false);
});

Deno.test("parseOutline rejects indented links with no folder above", () => {
  assertEquals(parseOutline("  A | https://a.test", [], counter()).ok, false);
  assertEquals(
    parseOutline("B | https://b.test\n  A | https://a.test", [], counter()).ok,
    false,
  );
});
