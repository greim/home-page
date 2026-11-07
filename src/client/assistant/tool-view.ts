/**
 * How the assistant window shows a tool call's input: edits as a line diff,
 * commands as commands, anything else as its JSON.
 */
import { diffLines } from "diff";

export type DiffRow = { readonly kind: "added" | "removed" | "same"; readonly text: string };

export type ToolView =
  | { is: "diff"; path: string; rows: ReadonlyArray<DiffRow> }
  | { is: "command"; command: string }
  | { is: "json"; text: string };

/** Unchanged lines kept around each change in a diff; longer runs are elided. */
export const diffContext = 3;

const lines = (text: string): ReadonlyArray<string> => {
  const split = text.split("\n");
  // A trailing newline ends the last line rather than starting another.
  return split.at(-1) === "" ? split.slice(0, -1) : split;
};

/**
 * The lines of `before` and `after`, marked added, removed or the same, with runs of
 * unchanged lines far from any change elided to a single "…" row.
 */
export const diffRows = (before: string, after: string): ReadonlyArray<DiffRow> => {
  const rows = diffLines(before, after).flatMap((part) =>
    lines(part.value).map((text): DiffRow => ({
      kind: part.added ? "added" : part.removed ? "removed" : "same",
      text,
    }))
  );
  const near = (i: number) =>
    rows.slice(Math.max(0, i - diffContext), i + diffContext + 1).some((r) => r.kind !== "same");
  return rows.flatMap((row, i): ReadonlyArray<DiffRow> => {
    if (row.kind !== "same" || near(i)) return [row];
    // Only the first of a run of elided lines shows, as "…".
    return i > 0 && !near(i - 1) && rows[i - 1]?.kind === "same"
      ? []
      : [{ kind: "same", text: "…" }];
  });
};

const string = (value: unknown): string | null => typeof value === "string" ? value : null;

/** A path inside `root` relative to it, else as is. */
const relativeTo = (root: string, path: string): string => {
  if (root === "") return path;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
};

export const toolView = (
  name: string,
  input: Readonly<Record<string, unknown>>,
  root = "",
): ToolView => {
  const path = string(input["file_path"]);
  if (name === "Edit" && path !== null) {
    return {
      is: "diff",
      path: relativeTo(root, path),
      rows: diffRows(string(input["old_string"]) ?? "", string(input["new_string"]) ?? ""),
    };
  }
  if (name === "Write" && path !== null) {
    return {
      is: "diff",
      path: relativeTo(root, path),
      rows: lines(string(input["content"]) ?? "").map((text) => ({ kind: "added", text })),
    };
  }
  const command = string(input["command"]);
  if (name === "Bash" && command !== null) return { is: "command", command };
  return { is: "json", text: JSON.stringify(input, null, 2) };
};
