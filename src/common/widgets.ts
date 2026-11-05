/**
 * Widget types: the manifest each widget folder provides, and the registry the
 * widget build collects them into. See SELF_BUILDING.md.
 */
import { Either, Schema } from "effect";

/** A widget type's ID: its folder's name under src/client/widgets/. */
export const WidgetId = Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/));

/** What a widget's `manifest.ts` exports as `manifest`. */
export type WidgetManifest<A, I> = {
  readonly title: string;
  readonly description: string;
  /** Decodes the widget's config, as it's saved in the layout. */
  readonly config: Schema.Schema<A, I>;
  /** The config a new widget of this type starts with. */
  readonly defaultConfig: A;
};

/** Declares a manifest, checking its shape. */
export const defineManifest = <A, I>(manifest: WidgetManifest<A, I>): WidgetManifest<A, I> =>
  manifest;

const AnySchema = Schema.declare(
  (u: unknown): u is Schema.Schema<unknown, unknown> => Schema.isSchema(u),
  { identifier: "Schema" },
);

/** A manifest module, as the build imports it. */
const ManifestModule = Schema.Struct({
  manifest: Schema.Struct({
    title: Schema.NonEmptyTrimmedString,
    description: Schema.NonEmptyTrimmedString,
    config: AnySchema,
    defaultConfig: Schema.Unknown,
  }),
});

export const decodeManifestModule = (
  module: unknown,
): Either.Either<WidgetManifest<unknown, unknown>, string> =>
  Either.map(
    Either.mapLeft(Schema.decodeUnknownEither(ManifestModule)(module), (e) => e.message),
    (m) => m.manifest,
  );

export const RegistryEntry = Schema.Struct({
  id: WidgetId,
  title: Schema.String,
  description: Schema.String,
  /** Changes whenever the bundle does, for cache-busting its URL. */
  version: Schema.String,
  /** The config's JSON Schema, for the assistant. */
  configSchema: Schema.Unknown,
  /** A new widget's config, as it's saved in the layout. */
  defaultConfig: Schema.Unknown,
});
export type RegistryEntry = typeof RegistryEntry.Type;

export const Registry = Schema.Struct({ widgets: Schema.Array(RegistryEntry) });
export type Registry = typeof Registry.Type;

/** Where each widget's files are, relative to the widget build's output. */
export const registryFile = "registry.json";
export const bundleFile = (id: string): string => `${id}/main.js`;

/** Where the server serves the widget build's output. */
export const widgetAssetsPath = "/web/assets/widgets/";

/** A widget's bundle URL, versioned so a reload never gets a stale one from cache. */
export const widgetBundleUrl = (registry: Registry, id: string): Either.Either<string, string> => {
  const entry = registry.widgets.find((w) => w.id === id);
  return entry === undefined
    ? Either.left(`There's no widget type called "${id}"`)
    : Either.right(`${widgetAssetsPath}${bundleFile(id)}?v=${encodeURIComponent(entry.version)}`);
};
