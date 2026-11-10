/**
 * Loads the manifests of the widget types a layout uses, for checking each widget's
 * config against its type's (src/common/widget-configs.ts). The assistant's server
 * runs the check (via bin/check-layout.ts) on the agent's layout when a turn ends.
 */
import { Effect, Either } from "effect";
import type { LoadedType } from "../src/common/widget-configs.ts";
import { decodeManifestModule } from "../src/common/widgets.ts";
import { type BuildIoError, WidgetBuildIo } from "./widget-build.ts";

const describe = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

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
