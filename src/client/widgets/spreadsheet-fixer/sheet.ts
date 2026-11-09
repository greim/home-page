/**
 * What the spreadsheet fixer's agent tools do to a sheet: describe it, so the agent
 * can see what needs fixing, and apply the changes it chooses. Pure: the tools read
 * and write the files (agent-tools.ts).
 */
import { Schema } from "effect";
import type { Rows } from "./csv.ts";

export type Sheet = { readonly headers: ReadonlyArray<string>; readonly rows: Rows };

export const toSheet = (rows: Rows): Sheet => ({
  headers: rows.at(0) ?? [],
  rows: rows.slice(1).map((row) => [...row]),
});

export const fromSheet = (sheet: Sheet): Rows => [sheet.headers, ...sheet.rows];

const empty = (row: ReadonlyArray<string>) => row.every((cell) => cell.trim() === "");

/** A sheet's shape and its likely problems, for the agent to decide what to fix. */
export const overview = (sheet: Sheet, sampleRows = 8) => {
  const keys = sheet.rows.map((row) => JSON.stringify(row));
  return {
    rows: sheet.rows.length,
    emptyRows: sheet.rows.filter(empty).length,
    duplicateRows: keys.length - new Set(keys).size,
    raggedRows: sheet.rows.filter((row) => row.length !== sheet.headers.length).length,
    columns: sheet.headers.map((name, i) => {
      const values = sheet.rows.map((row) => row.at(i) ?? "");
      const distinct = [...new Set(values.filter((v) => v.trim() !== ""))];
      return {
        name,
        empty: values.filter((v) => v.trim() === "").length,
        distinct: distinct.length,
        padded: values.filter((v) => v !== v.trim()).length,
        samples: distinct.slice(0, 6),
      };
    }),
    firstRows: sheet.rows.slice(0, sampleRows),
  };
};

const Column = Schema.String.annotations({ description: "A column, by its header" });

export const Operation = Schema.Union(
  Schema.Struct({ op: Schema.Literal("rename_column"), column: Column, to: Schema.String }),
  Schema.Struct({
    op: Schema.Literal("trim_whitespace"),
    column: Column.annotations({ description: 'A column, by its header, or "*" for all' }),
  }),
  Schema.Struct({
    op: Schema.Literal("set_case"),
    column: Column,
    case: Schema.Literal("upper", "lower", "title"),
  }),
  Schema.Struct({
    op: Schema.Literal("replace"),
    column: Column,
    from: Schema.String.annotations({ description: "A whole cell's value to replace" }),
    to: Schema.String,
  }),
  Schema.Struct({
    op: Schema.Literal("format_dates"),
    column: Column,
  }).annotations({ description: "Rewrites the column's dates as YYYY-MM-DD" }),
  Schema.Struct({ op: Schema.Literal("drop_column"), column: Column }),
  Schema.Struct({ op: Schema.Literal("drop_empty_rows") }),
  Schema.Struct({ op: Schema.Literal("drop_duplicate_rows") }),
  Schema.Struct({
    op: Schema.Literal("set_cell"),
    row: Schema.Int.annotations({ description: "A data row, counting from 1 (not the headers)" }),
    column: Column,
    value: Schema.String,
  }),
  Schema.Struct({
    op: Schema.Literal("split_column"),
    column: Column,
    separator: Schema.String,
    into: Schema.Array(Schema.String).annotations({ description: "The new columns' headers" }),
  }),
);
export type Operation = typeof Operation.Type;

const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

const isoDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
};

const fullYear = (y: string): number => y.length === 2 ? 2000 + Number(y) : Number(y);

/**
 * A date as YYYY-MM-DD, from 2026-03-07, 2026/3/7, 3/7/2026 or 3/7/26 (month first),
 * "Mar 7, 2026" or "7 March 2026"; null if it isn't one of those.
 */
export const toIsoDate = (text: string): string | null => {
  const value = text.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
  if (m) return isoDate(fullYear(m[3] ?? ""), Number(m[1]), Number(m[2]));
  m = /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/i.exec(value);
  if (m) {
    const month = monthNames.indexOf((m[1] ?? "").slice(0, 3).toLowerCase()) + 1;
    return month === 0 ? null : isoDate(Number(m[3]), month, Number(m[2]));
  }
  m = /^(\d{1,2}) ([a-z]+)\.?,? (\d{4})$/i.exec(value);
  if (m) {
    const month = monthNames.indexOf((m[2] ?? "").slice(0, 3).toLowerCase()) + 1;
    return month === 0 ? null : isoDate(Number(m[3]), month, Number(m[1]));
  }
  return null;
};

const titleCase = (text: string) =>
  text.toLowerCase().replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, before, letter) => before + letter.toUpperCase(),
  );

/** What applying one operation did: the sheet after, and what changed, in words. */
export type Applied = { readonly sheet: Sheet; readonly note: string };

const mapColumn = (sheet: Sheet, i: number, f: (cell: string) => string) => {
  let changed = 0;
  const rows = sheet.rows.map((row) =>
    row.map((cell, j) => {
      if (j !== i) return cell;
      const next = f(cell);
      if (next !== cell) changed++;
      return next;
    })
  );
  return { sheet: { ...sheet, rows }, changed };
};

/** Applies one operation; throws, saying why, if it can't (e.g. no such column). */
export const apply = (sheet: Sheet, operation: Operation): Applied => {
  const index = (column: string) => {
    const i = sheet.headers.indexOf(column);
    if (i === -1) {
      throw new Error(`There's no column "${column}" (the columns: ${sheet.headers.join(", ")})`);
    }
    return i;
  };
  switch (operation.op) {
    case "rename_column": {
      const i = index(operation.column);
      return {
        sheet: { ...sheet, headers: sheet.headers.map((h, j) => j === i ? operation.to : h) },
        note: `Renamed "${operation.column}" to "${operation.to}"`,
      };
    }
    case "trim_whitespace": {
      const all = operation.column === "*";
      const i = all ? -1 : index(operation.column);
      let changed = 0;
      const rows = sheet.rows.map((row) =>
        row.map((cell, j) => {
          if (!all && j !== i) return cell;
          const next = cell.trim().replace(/\s+/g, " ");
          if (next !== cell) changed++;
          return next;
        })
      );
      const headers = sheet.headers.map((h) => h.trim());
      const renamed = headers.filter((h, i) => h !== sheet.headers.at(i)).length;
      return {
        sheet: { headers, rows },
        note: `Trimmed spaces in ${changed} cells` +
          (renamed > 0 ? ` and ${renamed} headers (now ${headers.join(", ")})` : ""),
      };
    }
    case "set_case": {
      const f = operation.case === "upper"
        ? (s: string) => s.toUpperCase()
        : operation.case === "lower"
        ? (s: string) => s.toLowerCase()
        : titleCase;
      const done = mapColumn(sheet, index(operation.column), f);
      return {
        sheet: done.sheet,
        note: `Changed the case of ${done.changed} cells in "${operation.column}"`,
      };
    }
    case "replace": {
      const done = mapColumn(
        sheet,
        index(operation.column),
        (cell) => cell === operation.from ? operation.to : cell,
      );
      return {
        sheet: done.sheet,
        note:
          `Replaced "${operation.from}" with "${operation.to}" in ${done.changed} cells of "${operation.column}"`,
      };
    }
    case "format_dates": {
      let unreadable = 0;
      const done = mapColumn(sheet, index(operation.column), (cell) => {
        if (cell.trim() === "") return cell;
        const iso = toIsoDate(cell);
        if (iso === null) unreadable++;
        return iso ?? cell;
      });
      return {
        sheet: done.sheet,
        note: `Reformatted ${done.changed} dates in "${operation.column}"` +
          (unreadable > 0 ? `; ${unreadable} weren't dates it could read, and were left` : ""),
      };
    }
    case "drop_column": {
      const i = index(operation.column);
      return {
        sheet: {
          headers: sheet.headers.filter((_, j) => j !== i),
          rows: sheet.rows.map((row) => row.filter((_, j) => j !== i)),
        },
        note: `Removed the column "${operation.column}"`,
      };
    }
    case "drop_empty_rows": {
      const rows = sheet.rows.filter((row) => !empty(row));
      return {
        sheet: { ...sheet, rows },
        note: `Removed ${sheet.rows.length - rows.length} empty rows`,
      };
    }
    case "drop_duplicate_rows": {
      const seen = new Set<string>();
      const rows = sheet.rows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        sheet: { ...sheet, rows },
        note: `Removed ${sheet.rows.length - rows.length} duplicate rows`,
      };
    }
    case "set_cell": {
      const i = index(operation.column);
      if (operation.row < 1 || operation.row > sheet.rows.length) {
        throw new Error(`There's no row ${operation.row} (the sheet has ${sheet.rows.length})`);
      }
      const rows = sheet.rows.map((row, r) =>
        r === operation.row - 1 ? row.map((cell, j) => j === i ? operation.value : cell) : row
      );
      return {
        sheet: { ...sheet, rows },
        note: `Set row ${operation.row}'s "${operation.column}"`,
      };
    }
    case "split_column": {
      const i = index(operation.column);
      const parts = (cell: string) => {
        const split = cell.split(operation.separator);
        return operation.into.map((_, k) =>
          (k === operation.into.length - 1
            ? split.slice(k).join(operation.separator)
            : split.at(k) ?? "")
            .trim()
        );
      };
      return {
        sheet: {
          headers: [...sheet.headers.slice(0, i), ...operation.into, ...sheet.headers.slice(i + 1)],
          rows: sheet.rows.map((
            row,
          ) => [...row.slice(0, i), ...parts(row.at(i) ?? ""), ...row.slice(i + 1)]),
        },
        note: `Split "${operation.column}" into ${operation.into.map((c) => `"${c}"`).join(", ")}`,
      };
    }
    default:
      return operation satisfies never;
  }
};

/** The name of a fixed copy of a file: sheet.csv → sheet-fixed.csv. */
export const fixedName = (file: string): string => `${file.replace(/\.csv$/i, "")}-fixed.csv`;
