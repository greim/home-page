import { defaultColumnColor, fromHex } from "./column-color.ts";
import { defaultSchedule } from "./day-cycle.ts";
import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import {
  defaultColumnIcon,
  defaultLayout,
  emptyLayout,
  Layout,
  newWidget,
  widgetHeading,
} from "./model.ts";

const decode = Schema.decodeUnknownEither(Layout);

Deno.test("Layout decodes a well-formed layout", () => {
  const layout: Layout = {
    version: 1,
    schedule: defaultSchedule,
    columns: [{
      id: "c",
      heading: "Work",
      hidden: false,
      color: defaultColumnColor,
      icon: "LuStar",
      widgets: [
        newWidget({ id: "clock", defaultConfig: { timeZone: null } }, "w1"),
        newWidget({ id: "snippets", defaultConfig: {} }, "w2"),
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

/** How widgets were saved until NEW_LAYOUT.md: with a heading and collapse state of the page's. */
const old = { id: "w", subheading: "Links", collapsed: true };
/** The same, as a widget's own config holds them now. */
const moved = { heading: "Links", collapsed: true };

Deno.test("Layout leaves a widget's config to the widget", () => {
  const widget = { id: "w", is: "weather", config: { anything: [1, "two"] } };
  assertEquals(decodedWidget(widget), Either.right(widget));
});

Deno.test("Layout rejects a widget type ID that isn't a folder name", () => {
  assertEquals(Either.isLeft(decode(withWidget({ id: "w", is: "Bad Type", config: {} }))), true);
});

Deno.test("Layout moves a widget's old heading and collapse state into its config", () => {
  assertEquals(
    decodedWidget({ ...old, is: "bookmarks", config: { items: [] } }),
    Either.right({ id: "w", is: "bookmarks", config: { ...moved, items: [] } }),
  );
  // A config that already has its own keeps them.
  assertEquals(
    decodedWidget({ ...old, is: "bookmarks", config: { heading: "Mine", items: [] } }),
    Either.right({
      id: "w",
      is: "bookmarks",
      config: { heading: "Mine", collapsed: true, items: [] },
    }),
  );
  // A config that isn't an object is left for the widget to reject.
  assertEquals(
    decodedWidget({ ...old, is: "clock", config: null }),
    Either.right({ id: "w", is: "clock", config: null }),
  );
});

Deno.test("Layout moves an older widget's settings into its config", () => {
  const items = [{ is: "link", id: "l", label: "L", url: "https://x.test" }];
  assertEquals(
    decodedWidget({ ...old, is: "bookmarks", items }),
    Either.right({ id: "w", is: "bookmarks", config: { ...moved, items } }),
  );
  assertEquals(
    decodedWidget({ ...old, is: "snippets" }),
    Either.right({ id: "w", is: "snippets", config: moved }),
  );
});

Deno.test("Layout reads the interim MFE widget shape", () => {
  assertEquals(
    decodedWidget({ ...old, is: "mfe", mfe: "clock", config: { timeZone: null } }),
    Either.right({ id: "w", is: "clock", config: { ...moved, timeZone: null } }),
  );
});

Deno.test("Layout saves migrated widgets in the current shape", () => {
  const decoded = Either.getOrThrow(decode(withWidget({ ...old, is: "snippets", snippets: [] })));
  assertEquals(Schema.encodeSync(Layout)(decoded).columns.at(0)?.widgets.at(0), {
    id: "w",
    is: "snippets",
    config: { ...moved, snippets: [] },
  });
});

Deno.test("Column color defaults for older layouts", () => {
  const legacy = {
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, widgets: [] }],
  };
  assertEquals(
    Either.map(decode(legacy), (l) => l.columns.at(0)?.color),
    Either.right(defaultColumnColor),
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

Deno.test("Column colors saved as #rrggbb keep their chroma and hue, and save as { c, h }", () => {
  const withColor = (color: unknown) => ({
    version: 1,
    columns: [{ id: "c", heading: "", hidden: false, color, widgets: [] }],
  });
  const decoded = Schema.decodeUnknownSync(Layout)(withColor("#A0b1C2"));
  assertEquals(decoded.columns.at(0)?.color, fromHex("#A0b1C2"));
  assertEquals(Schema.encodeSync(Layout)(decoded).columns.at(0)?.color, fromHex("#A0b1C2"));
  assertEquals(Either.isRight(decode(withColor({ c: 0.02, h: 300 }))), true);
  assertEquals(Either.isLeft(decode(withColor("red"))), true);
  assertEquals(Either.isLeft(decode(withColor({ c: 1, h: 300 }))), true);
});

Deno.test("Layouts saved with a background and skin decode without them, and save without them", () => {
  const decoded = Schema.decodeUnknownSync(Layout)({
    version: 1,
    background: { imageUrl: "/web/assets/trees.jpg", color: "#666666", opacity: 1 },
    skin: { layoutSpacing: 2, bodyFont: "serif" },
    columns: [],
  });
  assertEquals(decoded, emptyLayout);
  assertEquals(Schema.encodeSync(Layout)(decoded), emptyLayout);
});

Deno.test("widgetHeading is the config's heading, when it has a non-blank one", () => {
  const widget = (config: unknown) => ({ id: "w", is: "bookmarks", config });
  assertEquals(widgetHeading(widget({ heading: "Links" })), "Links");
  assertEquals(widgetHeading(widget({ heading: "  " })), null);
  assertEquals(widgetHeading(widget({ heading: 3 })), null);
  assertEquals(widgetHeading(widget({})), null);
  assertEquals(widgetHeading(widget(null)), null);
});

Deno.test("the default layout is a valid layout with a clock in it", () => {
  assertEquals(decode(defaultLayout), Either.right(defaultLayout));
  assertEquals(defaultLayout.columns.flatMap((c) => c.widgets.map((w) => w.is)), ["clock"]);
});

Deno.test("widgets of retired types (the old assistant widget) are dropped when a layout is read", () => {
  const stored = {
    version: 1,
    columns: [{
      id: "c",
      heading: "Utility",
      hidden: false,
      widgets: [
        { id: "a", is: "assistant", config: {} },
        { id: "k", is: "clock", config: {} },
      ],
    }],
  };
  const layout = Schema.decodeUnknownSync(Layout)(stored);
  assertEquals(layout.columns[0]?.widgets.map((w) => w.is), ["clock"]);
});
