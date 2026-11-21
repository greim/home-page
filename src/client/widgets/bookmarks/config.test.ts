import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import { BookmarksConfig } from "./config.ts";

Deno.test("configs saved without a heading have none", () => {
  assertEquals(
    Schema.decodeUnknownEither(BookmarksConfig)({ items: [] }),
    Either.right({ heading: "", items: [] }),
  );
});

Deno.test("configs saved with open/closed state ignore it, and lose it when saved again", () => {
  const decoded = Schema.decodeUnknownSync(BookmarksConfig)({
    heading: "Links",
    collapsed: true,
    items: [{ is: "folder", id: "f", label: "F", expanded: true, children: [] }],
  });
  assertEquals(Schema.encodeSync(BookmarksConfig)(decoded), {
    heading: "Links",
    items: [{ is: "folder", id: "f", label: "F", children: [] }],
  });
});
