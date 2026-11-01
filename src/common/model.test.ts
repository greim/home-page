import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import {
  defaultBackground,
  defaultColumnIcon,
  defaultSkin,
  emptyLayout,
  Layout,
  newWidget,
  type Skin,
  widgetKinds,
} from "./model.ts";

const decode = Schema.decodeUnknownEither(Layout);

Deno.test("Layout decodes a well-formed layout", () => {
  const layout: Layout = {
    version: 1,
    background: defaultBackground,
    skin: defaultSkin,
    columns: [{
      id: "c",
      heading: "Work",
      hidden: false,
      color: "#ffffff",
      icon: "LuStar",
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

Deno.test("Column icon defaults for older layouts", () => {
  const legacy = {
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, widgets: [] }],
  };
  assertEquals(
    Either.map(decode(legacy), (l) => l.columns.at(0)?.icon),
    Either.right(defaultColumnIcon),
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

Deno.test("Layout skin defaults for older layouts", () => {
  assertEquals(
    Either.map(decode({ version: 1, columns: [] }), (l) => l.skin),
    Either.right(defaultSkin),
  );
});

Deno.test("Skin fields default one by one, so a skin can list only what differs", () => {
  assertEquals(
    Either.map(
      decode({
        version: 1,
        skin: { layoutSpacing: 2, headingFont: { is: "google", name: "Lora", fallback: "serif" } },
        columns: [],
      }),
      (l) => l.skin,
    ),
    Either.right<Skin>({
      ...defaultSkin,
      layoutSpacing: 2,
      headingFont: { is: "google", name: "Lora", fallback: "serif" },
    }),
  );
});

Deno.test("Skin rejects out-of-range values and fonts that could break out of CSS", () => {
  const withSkin = (skin: unknown) => decode({ version: 1, skin, columns: [] });
  const font = (name: unknown, fallback: unknown = "sans-serif") => ({
    bodyFont: { is: "google", name, fallback },
  });
  assertEquals(Either.isRight(withSkin(font("M PLUS 1p"))), true);
  for (
    const bad of [
      { textSpacing: 0.5 },
      { layoutSpacing: -1 },
      { cornerRounding: 7 },
      { columnShadow: { blur: 1, distance: 1, opacity: 2 } },
      { columnShadow: { blur: 1, distance: 1 } },
      { columnShadow: { blur: 1, distance: 1, opacity: 0.5, angle: 270 } },
      { columnHeadingWeight: 450.5 },
      { widgetHeadingWeight: 1000 },
      { widgetHeadingOpacity: -0.1 },
      { bodyFont: "serif; color: red" },
      { codeFont: "mono}" },
      { headingFont: "" },
      font(""),
      font(`Open Sans", serif`),
      font("Open Sans; color: red"),
      font("Open Sans", "Arial"),
      { bodyFont: { is: "system", fallback: "serif" } },
      { bodyFont: { is: "adobe", name: "Minion", fallback: "serif" } },
    ]
  ) {
    assertEquals(Either.isLeft(withSkin(bad)), true, JSON.stringify(bad));
  }
});

Deno.test("Fonts saved as CSS font-family lists decode as system fonts", () => {
  const bodyFont = (list: string) =>
    Either.map(
      decode({ version: 1, skin: { bodyFont: list }, columns: [] }),
      (l) => l.skin.bodyFont,
    );
  assertEquals(
    bodyFont("sans-serif"),
    Either.right({ is: "system", name: null, fallback: "sans-serif" }),
  );
  assertEquals(
    bodyFont(`"Helvetica Neue", Arial, sans-serif`),
    Either.right({ is: "system", name: "Helvetica Neue", fallback: "sans-serif" }),
  );
  assertEquals(
    bodyFont("Georgia, 'Times New Roman'"),
    Either.right({ is: "system", name: "Georgia", fallback: "sans-serif" }),
  );
  assertEquals(
    bodyFont("monospace, serif"),
    Either.right({ is: "system", name: null, fallback: "monospace" }),
  );
});

Deno.test("Fonts are saved as objects, even ones that were read from strings", () => {
  const decoded = Schema.decodeUnknownSync(Layout)({
    version: 1,
    skin: { bodyFont: "serif" },
    columns: [],
  });
  const encoded = Schema.encodeSync(Layout)(decoded);
  assertEquals(encoded.skin?.bodyFont, { is: "system", name: null, fallback: "serif" });
});

Deno.test("Shadows saved before the light's angle existed get the default angle", () => {
  assertEquals(
    Either.map(
      decode({
        version: 1,
        skin: { columnShadow: { blur: 1, distance: 2, opacity: 0.4 } },
        columns: [],
      }),
      (l) => l.skin.columnShadow,
    ),
    Either.right({ blur: 1, distance: 2, opacity: 0.4, angle: 35 }),
  );
});
