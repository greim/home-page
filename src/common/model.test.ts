import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import { defaultBackground, emptyLayout, Layout, newWidget, widgetKinds } from "./model.ts";

const decode = Schema.decodeUnknownEither(Layout);

Deno.test("Layout decodes a well-formed layout", () => {
  const layout: Layout = {
    version: 1,
    background: defaultBackground,
    columns: [{
      id: "c",
      heading: "Work",
      hidden: false,
      color: "#ffffff",
      widgets: widgetKinds.map((k) => newWidget(k.is, k.is)),
    }],
  };
  assertEquals(decode(layout), Either.right(layout));
});

Deno.test("Layout decodes the empty layout", () => {
  assertEquals(decode(emptyLayout), Either.right(emptyLayout));
});

Deno.test("Layout rejects unknown widget kinds and bad grid sizes", () => {
  const withWidget = (widget: unknown) => ({
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, widgets: [widget] }],
  });
  assertEquals(Either.isLeft(decode(withWidget({ is: "weather" }))), true);
  assertEquals(
    Either.isLeft(
      decode(withWidget({ ...newWidget("form-grid", "f"), gridColumns: 7 })),
    ),
    true,
  );
});

Deno.test("Layout rejects folders nested inside folders", () => {
  const folder = {
    is: "folder",
    id: "f",
    label: "",
    expanded: false,
    children: [],
  };
  const widget = {
    ...newWidget("bookmarks", "b"),
    items: [{ ...folder, children: [folder] }],
  };
  assertEquals(
    Either.isLeft(decode({
      version: 1,
      columns: [{ id: "c", heading: "", hidden: false, widgets: [widget] }],
    })),
    true,
  );
});

Deno.test("Column color defaults to white for older layouts", () => {
  const legacy = {
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, widgets: [] }],
  };
  assertEquals(
    Either.map(decode(legacy), (l) => l.columns.at(0)?.color),
    Either.right("#ffffff"),
  );
});

Deno.test("Column color must be a #rrggbb hex color", () => {
  const withColor = (color: string) => ({
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, color, widgets: [] }],
  });
  assertEquals(Either.isRight(decode(withColor("#A0b1C2"))), true);
  assertEquals(Either.isLeft(decode(withColor("red"))), true);
  assertEquals(Either.isLeft(decode(withColor("#fff"))), true);
});

Deno.test("Layout background defaults for older layouts", () => {
  assertEquals(
    Either.map(decode({ version: 1, columns: [] }), (l) => l.background),
    Either.right(defaultBackground),
  );
});

Deno.test("Background only accepts local image URLs and opacities from 0 to 1", () => {
  const withBackground = (background: unknown) => decode({ version: 1, background, columns: [] });
  const ok = { imageUrl: "/api/backgrounds/0123456789abcdef.jpg", color: "#112233", opacity: 0.4 };
  assertEquals(Either.isRight(withBackground(ok)), true);
  assertEquals(Either.isRight(withBackground({ ...ok, imageUrl: null })), true);
  assertEquals(Either.isRight(withBackground({ ...ok, imageUrl: "/web/assets/trees.jpg" })), true);
  for (
    const bad of [
      { ...ok, imageUrl: "https://example.com/a.jpg" },
      { ...ok, imageUrl: "/api/backgrounds/../layout.json" },
      { ...ok, opacity: 1.5 },
      { ...ok, opacity: -0.1 },
      { ...ok, color: "black" },
    ]
  ) {
    assertEquals(Either.isLeft(withBackground(bad)), true, JSON.stringify(bad));
  }
});
