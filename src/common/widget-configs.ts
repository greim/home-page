/**
 * Checking each widget's config in a layout against its type's manifest: the part of
 * a layout its schema leaves to the widgets. Loading the manifests is the caller's
 * business (tooling/layout-check.ts for the assistant's check; the page
 * configurator's agent tools for its own).
 */
import { Either, Schema } from "effect";
import { type Layout, widgetHeading } from "./model.ts";
import type { WidgetManifest } from "./widgets.ts";

/** A widget type's manifest, or why it couldn't be loaded. */
export type LoadedType = Either.Either<WidgetManifest<unknown, unknown>, string>;

/** The widget types the layout uses. */
export const typesUsed = (layout: Layout): ReadonlyArray<string> => [
  ...new Set(layout.columns.flatMap((c) => c.widgets.map((w) => w.is))),
];

/** What's wrong with the layout's widget configs: one line per broken widget. */
export const configProblems = (
  layout: Layout,
  types: ReadonlyMap<string, LoadedType>,
): ReadonlyArray<string> =>
  layout.columns.flatMap((column) =>
    column.widgets.flatMap((widget) => {
      const heading = widgetHeading(widget);
      const where = `Widget ${widget.id}${
        heading === null ? "" : ` ("${heading}")`
      } in column ${column.id} ("${column.heading}")`;
      const type = types.get(widget.is);
      if (type === undefined) {
        return [`${where}: there's no widget type "${widget.is}" in src/client/widgets/`];
      }
      if (Either.isLeft(type)) {
        return [`${where}: its type "${widget.is}" can't be loaded: ${type.left}`];
      }
      const config = Schema.decodeUnknownEither(type.right.config)(widget.config);
      return Either.isLeft(config)
        ? [`${where}: its config is invalid: ${config.left.message}`]
        : [];
    })
  );

/** Ids used more than once in the layout, by columns and widgets alike: each must be unique. */
export const duplicateIds = (layout: Layout): ReadonlyArray<string> => {
  const ids = layout.columns.flatMap((c) => [c.id, ...c.widgets.map((w) => w.id)]);
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
};
