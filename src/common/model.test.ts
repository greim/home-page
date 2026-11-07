import { defaultSchedule } from "./day-cycle.ts";
import { assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import { defaultColumnIcon, emptyLayout, Layout, newWidget } from "./model.ts";

const decode = Schema.decodeUnknownEither(Layout);

Deno.test("Layout decodes a well-formed layout", () => {
  const layout: Layout = {
    version: 1,
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
