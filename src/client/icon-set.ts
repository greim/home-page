/**
 * The icons a column heading can show: every Lucide icon react-icons provides,
 * addressed by export name. Decisions live in column-icons.ts.
 */
import type { IconType } from "react-icons/lib";
import * as lucide from "react-icons/lu";
import { defaultColumnIcon } from "../common/model.ts";
import { iconEntries, type IconEntry, pickIcon } from "./column-icons.ts";

const components = new Map<string, IconType>(
  // The namespace's types also admit a default export (the module itself); skip it.
  Object.entries(lucide).filter((entry): entry is [string, IconType] =>
    entry[0].startsWith("Lu") && typeof entry[1] === "function"
  ),
);

export const allIcons: ReadonlyArray<IconEntry> = iconEntries([...components.keys()]);

/** The icon component for a name, or the default icon for names no longer provided. */
export const iconFor = (name: string): IconType =>
  components.get(name) ?? components.get(defaultColumnIcon) ?? lucide.LuLayoutGrid;

/** A random icon name, for a freshly created column. */
export const randomIcon = (): string => pickIcon([...components.keys()], Math.random());
