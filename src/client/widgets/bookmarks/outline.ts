/**
 * A plain-text outline format for editing bookmarks:
 *
 *     Label | https://example.com
 *     Folder label
 *       Child label | https://example.com/child
 *
 * Unindented lines are top-level nodes: a link if they contain ` | `,
 * otherwise a folder. Indented lines are links belonging to the folder above.
 * Blank lines are ignored.
 */
import type { BookmarkNode, Folder, Link } from "./config.ts";

const separator = " | ";

export const serializeOutline = (items: ReadonlyArray<BookmarkNode>): string =>
  items
    .flatMap((node) => {
      switch (node.is) {
        case "link":
          return [`${node.label}${separator}${node.url}`];
        case "folder":
          return [
            node.label,
            ...node.children.map((c) => `  ${c.label}${separator}${c.url}`),
          ];
        default:
          return node satisfies never;
      }
    })
    .join("\n");

export type ParsedOutline =
  | { ok: true; items: ReadonlyArray<BookmarkNode> }
  | { ok: false; errorMessage: string };

type ParsedLine =
  | { is: "link"; indented: boolean; label: string; url: string }
  | { is: "folder"; label: string };

const parseLine = (raw: string): ParsedLine => {
  const indented = /^\s/.test(raw);
  const text = raw.trim();
  const at = text.lastIndexOf(separator);
  if (at === -1) {
    return { is: "folder", label: text };
  }
  return {
    is: "link",
    indented,
    label: text.slice(0, at).trim(),
    url: text.slice(at + separator.length).trim(),
  };
};

/**
 * @param previous existing nodes: a folder keeps its id when a folder of the same label is still
 *   there, so what's stored about it (whether it's open) still applies
 * @param makeId generates ids for the parsed nodes
 */
export const parseOutline = (
  text: string,
  previous: ReadonlyArray<BookmarkNode>,
  makeId: () => string,
): ParsedOutline => {
  // Folders sharing a label take over ids in order.
  const folderIds = new Map<string, Array<string>>();
  for (const node of previous) {
    if (node.is === "folder") {
      folderIds.set(node.label, [...(folderIds.get(node.label) ?? []), node.id]);
    }
  }
  const items: Array<BookmarkNode> = [];
  const lines = text.split("\n");
  for (const [index, raw] of lines.entries()) {
    if (raw.trim() === "") {
      continue;
    }
    const line = parseLine(raw);
    const lineNo = index + 1;
    if (line.is === "folder") {
      if (/^\s/.test(raw)) {
        return {
          ok: false,
          errorMessage: `Line ${lineNo}: nested items must be links ("Label${separator}URL")`,
        };
      }
      const folder: Folder = {
        is: "folder",
        id: folderIds.get(line.label)?.shift() ?? makeId(),
        label: line.label,
        children: [],
      };
      items.push(folder);
      continue;
    }
    if (!URL.canParse(line.url)) {
      return {
        ok: false,
        errorMessage: `Line ${lineNo}: not a valid URL: ${line.url}`,
      };
    }
    const link: Link = {
      is: "link",
      id: makeId(),
      label: line.label,
      url: line.url,
    };
    if (!line.indented) {
      items.push(link);
      continue;
    }
    const parent = items.at(-1);
    if (parent?.is !== "folder") {
      return {
        ok: false,
        errorMessage: `Line ${lineNo}: indented links must follow a folder`,
      };
    }
    items[items.length - 1] = {
      ...parent,
      children: [...parent.children, link],
    };
  }
  return { ok: true, items };
};
