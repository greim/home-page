/**
 * Checks each widget's config in a layout against its type's manifest: the part
 * of a layout its schema leaves to the widgets. The assistant's server runs it
 * (via bin/check-layout.ts) on the agent's layout when a turn ends.
 */
import { Effect, Either, Schema } from "effect";
import { type Layout, widgetHeading } from "../src/common/model.ts";
import { decodeManifestModule, type WidgetManifest } from "../src/common/widgets.ts";
import { type BuildIoError, WidgetBuildIo } from "./widget-build.ts";

/** A widget type's manifest, or why it couldn't be loaded. */
export type LoadedType = Either.Either<WidgetManifest<unknown, unknown>, string>;

const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

/** The widget types the layout uses. */
export const typesUsed = (layout: Layout): ReadonlyArray<string> => [
  ...new Set(layout.columns.flatMap((c) => c.widgets.map((w) => w.is))),
];

const isNotFound = (e: BuildIoError) => e.cause instanceof Deno.errors.NotFound;

/** Loads each type's manifest from its folder; a missing folder means there's no such type. */
export const loadTypes = (
  sourceDir: string,
  ids: ReadonlyArray<string>,
): Effect.Effect<ReadonlyMap<string, LoadedType>, never, WidgetBuildIo> =>
  Effect.gen(function* () {
    const io = yield* WidgetBuildIo;
    const folders = new Set(
      (yield* io.listDir(sourceDir).pipe(
        Effect.catchIf(isNotFound, () => Effect.succeed([])),
        Effect.orElseSucceed(() => []),
      )).filter((e) => e.isDirectory).map((e) => e.name),
    );
    const loaded = yield* Effect.forEach(ids.filter((id) => folders.has(id)), (id) =>
      io.importModule(`${sourceDir}/${id}/manifest.ts`).pipe(
        Effect.mapError((e) =>
          `its manifest.ts failed to load: ${describe(e.cause)}`
        ),
        Effect.flatMap((module) =>
          Either.mapLeft(decodeManifestModule(module), (e) => `its manifest is invalid: ${e}`)
        ),
        Effect.either,
        Effect.map((type) => [id, type] as const),
      ));
    return new Map(loaded);
  });

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
