/**
 * What a change to the layout does, in plain words, for the user to look over
 * before applying it: columns and widgets added, removed, moved and changed, the
 * schedule, and any links that weren't on the page before.
 */
import type { Column, Layout, Widget } from "../../../common/model.ts";
import { widgetHeading } from "../../../common/model.ts";

const quoted = (text: string) => `“${text}”`;

const columnName = (column: Column) => quoted(column.heading.trim() || "Untitled");

const widgetName = (widget: Widget) => {
  const heading = widgetHeading(widget);
  return heading === null ? `a ${widget.is} widget` : `${widget.is} ${quoted(heading)}`;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Where each widget is: its column, and the widget itself. */
const placed = (layout: Layout) =>
  new Map(
    layout.columns.flatMap((column) =>
      column.widgets.map((widget) => [widget.id, { column, widget }] as const)
    ),
  );

/** Whether the ids both lists share are in the same order in each. */
const sameOrder = (before: ReadonlyArray<string>, after: ReadonlyArray<string>) => {
  const kept = new Set(after.filter((id) => before.includes(id)));
  return same(before.filter((id) => kept.has(id)), after.filter((id) => kept.has(id)));
};

const scheduleChanges = (before: Layout, after: Layout): ReadonlyArray<string> => {
  const [a, b] = [before.schedule, after.schedule];
  return [
    ...(a.startOfDay !== b.startOfDay || a.endOfDay !== b.endOfDay
      ? [`Your day now runs from ${b.startOfDay} to ${b.endOfDay}`]
      : []),
    ...(same(a.weekend, b.weekend) ? [] : [
      b.weekend.is === "none"
        ? "You now have no weekend"
        : `Your weekend is now ${b.weekend.days.join(" and ")}`,
    ]),
  ];
};

const columnChanges = (before: Layout, after: Layout): ReadonlyArray<string> => {
  const old = new Map(before.columns.map((c) => [c.id, c]));
  const kept = new Set(after.columns.map((c) => c.id));
  return [
    ...before.columns.filter((c) => !kept.has(c.id)).map((c) => `Removed column ${columnName(c)}`),
    ...after.columns.flatMap((c) => {
      const was = old.get(c.id);
      if (was === undefined) return [`Added column ${columnName(c)}`];
      return [
        ...(was.heading === c.heading
          ? []
          : [`Renamed column ${columnName(was)} to ${columnName(c)}`]),
        ...(was.hidden === c.hidden
          ? []
          : [`${c.hidden ? "Hid" : "Showed"} column ${columnName(c)}`]),
        ...(same(was.color, c.color) ? [] : [`Changed the color of column ${columnName(c)}`]),
        ...(was.icon === c.icon ? [] : [`Changed the icon of column ${columnName(c)}`]),
        ...(sameOrder(was.widgets.map((w) => w.id), c.widgets.map((w) => w.id))
          ? []
          : [`Reordered the widgets in column ${columnName(c)}`]),
      ];
    }),
    ...(sameOrder(before.columns.map((c) => c.id), after.columns.map((c) => c.id))
      ? []
      : ["Reordered the columns"]),
  ];
};

const widgetChanges = (before: Layout, after: Layout): ReadonlyArray<string> => {
  const [old, now] = [placed(before), placed(after)];
  return [
    ...[...old].filter(([id]) => !now.has(id)).map(([, { column, widget }]) =>
      `Removed ${widgetName(widget)} from column ${columnName(column)}`
    ),
    ...[...now].flatMap(([id, { column, widget }]) => {
      const was = old.get(id);
      if (was === undefined) return [`Added ${widgetName(widget)} to column ${columnName(column)}`];
      return [
        ...(was.column.id === column.id ? [] : [
          `Moved ${widgetName(widget)} from column ${columnName(was.column)} to ${
            columnName(column)
          }`,
        ]),
        ...(was.widget.is !== widget.is || !same(was.widget.config, widget.config)
          ? [`Changed the settings of ${widgetName(widget)}`]
          : []),
      ];
    }),
  ];
};

/** What changing the layout from `before` to `after` does, one line per change. */
export const describeChanges = (before: Layout, after: Layout): ReadonlyArray<string> => [
  ...scheduleChanges(before, after),
  ...columnChanges(before, after),
  ...widgetChanges(before, after),
];

const links = (value: unknown): ReadonlyArray<string> =>
  typeof value === "string"
    ? (/^\s*https?:\/\//i.test(value) ? [value.trim()] : [])
    : Array.isArray(value)
    ? value.flatMap(links)
    : typeof value === "object" && value !== null
    ? Object.values(value).flatMap(links)
    : [];

/**
 * The web links in `after`'s widget settings that aren't in `before`'s: worth a look
 * before applying, since following one sends whatever it holds to its site.
 */
export const newLinks = (before: Layout, after: Layout): ReadonlyArray<string> => {
  const had = new Set(before.columns.flatMap((c) => c.widgets.flatMap((w) => links(w.config))));
  return [
    ...new Set(
      after.columns.flatMap((c) => c.widgets.flatMap((w) => links(w.config)))
        .filter((link) => !had.has(link)),
    ),
  ];
};
