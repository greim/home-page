import { assertEquals } from "@std/assert";
import { parseOutline, serializeOutline } from "./outline.ts";
import type { BookmarkNode } from "./config.ts";

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};

const items: ReadonlyArray<BookmarkNode> = [
  { is: "link", id: "id1", label: "Mail", url: "https://mail.test/" },
  {
    is: "folder",
    id: "dev",
    label: "Dev",
    children: [
      { is: "link", id: "id2", label: "Repo | main", url: "https://git.test/" },
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

Deno.test("parseOutline round-trips, keeping the ids of folders it already had", () => {
  assertEquals(parseOutline(text, items, counter()), { ok: true, items });
});

Deno.test("parseOutline gives folders sharing a label their old ids in order", () => {
  const twins: ReadonlyArray<BookmarkNode> = [
    { is: "folder", id: "a", label: "F", children: [] },
    { is: "folder", id: "b", label: "F", children: [] },
  ];
  const parsed = parseOutline("F\nF\nF", twins, counter());
  assertEquals(parsed.ok && parsed.items.map((n) => n.id), ["a", "b", "id1"]);
});

Deno.test("parseOutline rejects invalid URLs", () => {
  assertEquals(parseOutline("A | nope", [], counter()), {
    ok: false,
    errorMessage: "Line 1: not a valid URL: nope",
  });
});

Deno.test("parseOutline gives new folders new ids and skips blank lines", () => {
  assertEquals(parseOutline("\nNew\n\n\tA | https://a.test", [], counter()), {
    ok: true,
    items: [{
      is: "folder",
      id: "id1",
      label: "New",
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
