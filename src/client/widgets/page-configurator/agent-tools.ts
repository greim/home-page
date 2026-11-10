/**
 * The page configurator agent's own tools. They run in Deno, sandboxed to the run's
 * folder (see src/common/agent-tools.ts), reading the widget types' manifests and the
 * icon names from the source: the live layout is in in/layout.json, and a checked
 * layout goes to out/layout.json, for the widget to offer the user.
 */
import { Either, Schema } from "effect";
import { agentTool, defineAgentTools } from "../../../common/agent-tools.ts";
import { typesUsed } from "../../../common/widget-configs.ts";
import type { LoadedType } from "../../../common/widget-configs.ts";
import { decodeManifestModule } from "../../../common/widgets.ts";
import {
  checkLayout,
  describeTypes,
  findIcons,
  iconNames,
  layoutFileText,
  readLayout,
} from "./catalog.ts";

const widgetsDir = new URL("../", import.meta.url);
const lucideDeclarations = new URL(
  "../../../../node_modules/react-icons/lu/index.d.ts",
  import.meta.url,
);

/** The widget types there are: each folder of src/client/widgets/ with a manifest. */
const typeIds = async (): Promise<ReadonlyArray<string>> => {
  const ids: Array<string> = [];
  for await (const entry of Deno.readDir(widgetsDir)) {
    if (entry.isDirectory) ids.push(entry.name);
  }
  return ids.sort();
};

const loadTypes = async (ids: ReadonlyArray<string>): Promise<ReadonlyMap<string, LoadedType>> =>
  new Map(
    await Promise.all(ids.map(async (id): Promise<[string, LoadedType]> => {
      try {
        const module = await import(new URL(`${id}/manifest.ts`, widgetsDir).href);
        return [id, Either.mapLeft(decodeManifestModule(module), (e) => `invalid manifest: ${e}`)];
      } catch (e) {
        return [id, Either.left(`its manifest wouldn't load: ${e}`)];
      }
    })),
  );

const icons = async () => iconNames(await Deno.readTextFile(lucideDeclarations));

export const tools = defineAgentTools({
  widget_types: agentTool({
    description: 'Lists every widget type the page has: its id (a widget\'s "is"), title, what ' +
      "it does, its config's JSON Schema, and the config a new one starts with.",
    input: Schema.Struct({}),
    run: async () => describeTypes(await loadTypes(await typeIds())),
  }),
  find_icons: agentTool({
    description: "Finds column icons (Lucide icons, by react-icons name, e.g. LuCalendarDays) " +
      "whose names have every word of the query in them. Up to 60, shortest first.",
    input: Schema.Struct({
      query: Schema.String.annotations({ description: 'A word or two, e.g. "music" or "code"' }),
    }),
    run: async ({ query }) => findIcons(await icons(), query),
  }),
  new_ids: agentTool({
    description: "Gives fresh unique ids (random UUIDs) for new columns and widgets.",
    input: Schema.Struct({ count: Schema.Int.pipe(Schema.between(1, 50)) }),
    run: ({ count }) => Promise.resolve(Array.from({ length: count }, () => crypto.randomUUID())),
  }),
  check_layout: agentTool({
    description: "Checks in/layout.json after you've edited it: its shape, unique ids, column " +
      "icons, and each widget's config against its type's schema. If it passes, it's saved for " +
      "the user to apply, and you get any warnings; if not, you get the problems to fix. Call " +
      "it after your last edit.",
    input: Schema.Struct({}),
    run: async (_input, folder) => {
      const read = readLayout(await Deno.readTextFile(folder.path("in/layout.json")));
      if (Either.isLeft(read)) return { ok: false, problems: [read.left] };
      const known = new Set(await typeIds());
      const checked = checkLayout(
        read.right,
        // A type without a folder isn't loaded, so its widgets are reported as having no type.
        await loadTypes(typesUsed(read.right).filter((id) => known.has(id))),
        new Set(await icons()),
      );
      if (!checked.ok) return checked;
      await Deno.mkdir(folder.path("out"), { recursive: true });
      await Deno.writeTextFile(folder.path("out/layout.json"), layoutFileText(checked.layout));
      return { ok: true, warnings: checked.warnings };
    },
  }),
});
