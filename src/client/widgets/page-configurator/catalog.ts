/**
 * What the page configurator's agent tools (agent-tools.ts) work out, kept here as
 * plain functions: describing widget types, finding icons, and checking a layout
 * the agent edited. Loading manifests and reading files is the tools' business.
 */
import { Either, JSONSchema, Schema } from "effect";
import { maxChroma } from "../../../common/column-color.ts";
import { Layout } from "../../../common/model.ts";
import { configProblems, duplicateIds, type LoadedType } from "../../../common/widget-configs.ts";

/** A widget type, as the agent is told about it. */
export type TypeDescription = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly configSchema: unknown;
  readonly defaultConfig: unknown;
};

/** Each loaded widget type, described; types that wouldn't load are left out. */
export const describeTypes = (
  types: ReadonlyMap<string, LoadedType>,
): ReadonlyArray<TypeDescription> =>
  [...types].flatMap(([id, type]) =>
    Either.isLeft(type) ? [] : [{
      id,
      title: type.right.title,
      description: type.right.description,
      configSchema: JSONSchema.make(type.right.config),
      defaultConfig: type.right.defaultConfig,
    }]
  );

/** The icon names a react-icons type declaration file (e.g. lu/index.d.ts) exports. */
export const iconNames = (declarations: string): ReadonlyArray<string> =>
  [...declarations.matchAll(/export declare const (Lu\w+)\b/g)].map((m) => m[1] ?? "");

/** The most icons a search gives. */
export const maxIcons = 60;

/** Icon names with every word of the query in them, ignoring case (e.g. "calendar day"). */
export const findIcons = (names: ReadonlyArray<string>, query: string): ReadonlyArray<string> => {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w !== "");
  return names.filter((name) => words.every((w) => name.toLowerCase().includes(w)))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, maxIcons);
};

/** A layout the agent wrote, read: the layout, or what's wrong with its shape. */
export const readLayout = (text: string): Either.Either<Layout, string> =>
  Either.flatMap(
    Either.try({
      try: (): unknown => JSON.parse(text),
      catch: (e) => `It isn't valid JSON: ${e}`,
    }),
    (json) => Either.mapLeft(Schema.decodeUnknownEither(Layout)(json), (e) => e.message),
  );

/** How a layout is written to a file: as the layout store writes it. */
export const layoutFileText = (layout: Layout): string => JSON.stringify(layout, null, 2) + "\n";

export type Checked =
  | { readonly ok: true; readonly layout: Layout; readonly warnings: ReadonlyArray<string> }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> };

/**
 * Checks a layout: ids unique, column icons that exist, and each widget's config
 * against its type's (in `types`). Colors with more chroma than their hue reaches are
 * warnings: they work, but look like a less colorful one.
 */
export const checkLayout = (
  layout: Layout,
  types: ReadonlyMap<string, LoadedType>,
  icons: ReadonlySet<string>,
): Checked => {
  const problems = [
    ...duplicateIds(layout).map((id) =>
      `The id "${id}" is used more than once: ids must be unique`
    ),
    ...layout.columns.filter((c) => !icons.has(c.icon)).map((c) =>
      `Column ${c.id} ("${c.heading}"): there's no icon "${c.icon}" (use find_icons)`
    ),
    ...configProblems(layout, types),
  ];
  if (problems.length > 0) return { ok: false, problems };
  const warnings = layout.columns.flatMap((c) => {
    const most = maxChroma(c.color.h);
    return c.color.c > most
      ? [
        `Column ${c.id} ("${c.heading}"): chroma ${c.color.c} is more than hue ${c.color.h} ` +
        `reaches (about ${most.toFixed(3)}), so it looks the same as ${most.toFixed(3)}`,
      ]
      : [];
  });
  return { ok: true, layout, warnings };
};
