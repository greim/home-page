import { defaultSchedule } from "./day-cycle.ts";
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
} from "./model.ts";

const decode = Schema.decodeUnknownEither(Layout);

Deno.test("Layout decodes a well-formed layout", () => {
  const layout: Layout = {
    version: 1,
    background: defaultBackground,
    skin: defaultSkin,
    schedule: defaultSchedule,
    columns: [{
      id: "c",
      heading: "Work",
      hidden: false,
      color: "#ffffff",
      icon: "LuStar",
      widgets: [
        newWidget({ id: "clock", title: "Clock", defaultConfig: { timeZone: null } }, "w1"),
        newWidget({ id: "assistant", title: "Assistant", defaultConfig: {} }, "w2"),
      ],
    }],
  };
  assertEquals(decode(layout), Either.right(layout));
});

Deno.test("Layout decodes the empty layout", () => {
  assertEquals(decode(emptyLayout), Either.right(emptyLayout));
});

Deno.test("Layouts saved before the schedule existed get 9 to 5", () => {
  assertEquals(
    Either.map(decode({ version: 1, columns: [] }), (l) => l.schedule),
    Either.right(defaultSchedule),
  );
});

Deno.test("Layout keeps the user's schedule, and rejects an invalid one", () => {
  const schedule = { startOfDay: "07:30", endOfDay: "15:30" };
  assertEquals(
    Either.map(decode({ version: 1, schedule, columns: [] }), (l) => l.schedule),
    Either.right(schedule),
  );
  const backwards = { startOfDay: "17:00", endOfDay: "09:00" };
  assertEquals(Either.isLeft(decode({ version: 1, schedule: backwards, columns: [] })), true);
});

const withWidget = (widget: unknown) => ({
  version: 1,
  columns: [{ id: "c", heading: "", hidden: false, widgets: [widget] }],
});

const decodedWidget = (widget: unknown) =>
  Either.map(decode(withWidget(widget)), (l) => l.columns.at(0)?.widgets.at(0));

const base = { id: "w", subheading: "Links", collapsed: false };

Deno.test("Layout leaves a widget's config to the widget", () => {
  const widget = { ...base, is: "weather", config: { anything: [1, "two"] } };
  assertEquals(decodedWidget(widget), Either.right(widget));
});

Deno.test("Layout rejects a widget type ID that isn't a folder name", () => {
  assertEquals(Either.isLeft(decode(withWidget({ ...base, is: "Bad Type", config: {} }))), true);
});

Deno.test("Layout moves an older widget's settings into its config", () => {
  const items = [{ is: "link", id: "l", label: "L", url: "https://x.test" }];
  assertEquals(
    decodedWidget({ ...base, is: "bookmarks", items }),
    Either.right({ ...base, is: "bookmarks", config: { items } }),
  );
  assertEquals(
    decodedWidget({ ...base, is: "assistant" }),
    Either.right({ ...base, is: "assistant", config: {} }),
  );
});

Deno.test("Layout reads the interim MFE widget shape", () => {
  assertEquals(
    decodedWidget({ ...base, is: "mfe", mfe: "clock", config: { timeZone: null } }),
    Either.right({ ...base, is: "clock", config: { timeZone: null } }),
  );
});

Deno.test("Layout saves migrated widgets in the current shape", () => {
  const decoded = Either.getOrThrow(decode(withWidget({ ...base, is: "snippets", snippets: [] })));
  assertEquals(Schema.encodeSync(Layout)(decoded).columns.at(0)?.widgets.at(0), {
    ...base,
    is: "snippets",
    config: { snippets: [] },
  });
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
