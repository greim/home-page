/**
 * Reading a pasted data dump as rows (objects of field to value), for charting: JSON
 * in its common shapes, delimited text (CSV, TSV, semicolons or pipes), or an HTML
 * table's cells. What can't be read as rows stays text, for the agent to make sense of.
 */
import { Either } from "effect";

/** A value in a row: what JSON can hold, short of nesting. */
export type Value = string | number | boolean | null;
export type Row = Readonly<Record<string, Value>>;
export type Rows = ReadonlyArray<Row>;

/** What a paste came to. `format` names what it looked like, for the agent and the user. */
export type Dump =
  | { readonly is: "rows"; readonly format: string; readonly rows: Rows }
  | { readonly is: "text"; readonly format: string; readonly text: string }
  /** An image (a screenshot of a table, say), for the agent to read; kept as the chart's `image`. */
  | { readonly is: "image"; readonly format: string; readonly type: string };

/**
 * What was on the clipboard: its types, the first HTML table's cells (if any), its text,
 * and the type of the image on it (if any, and one the agent can read).
 */
export type Clip = {
  readonly types: ReadonlyArray<string>;
  readonly table: ReadonlyArray<ReadonlyArray<string>> | null;
  readonly text: string;
  readonly imageType: string | null;
};

/** The image types the agent can read, and what each is called. */
export const imageFormats: Readonly<Record<string, string>> = {
  "image/png": "a PNG image",
  "image/jpeg": "a JPEG image",
  "image/gif": "a GIF image",
  "image/webp": "a WebP image",
};

/** The most rows kept: more than any chart can show, and small enough to send. */
export const maxRows = 20000;

const numberPattern = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[-+]?\d+)?$/i;

/**
 * A cell's text as the value it means: numbers (commas between thousands, a leading
 * currency sign or trailing percent allowed) as numbers, true and false as booleans,
 * blanks as null, and anything else as the text, trimmed.
 */
export const cellValue = (cell: string): Value => {
  const text = cell.trim();
  if (text === "") return null;
  const lower = text.toLowerCase();
  if (lower === "true" || lower === "false") return lower === "true";
  if (lower === "null" || lower === "n/a" || lower === "na" || lower === "-") return null;
  const bare = text.replace(/^[$€£¥]/, "").replace(/%$/, "");
  if (/\d/.test(bare) && numberPattern.test(bare)) {
    const n = Number(bare.replaceAll(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return text;
};

/** Headers made unique and never blank: "Column 3" for a blank, "x 2" for a second "x". */
export const uniqueHeaders = (cells: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Map<string, number>();
  return cells.map((cell, i) => {
    const base = cell.trim() === "" ? `Column ${i + 1}` : cell.trim();
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
};

/** Whether a row of cells reads as headers: none blank, and none a number. */
const looksLikeHeaders = (cells: ReadonlyArray<string>): boolean =>
  cells.every((c) => c.trim() !== "" && typeof cellValue(c) !== "number");

/** Rows from a grid of cells, the first row as headers if it looks like them. */
export const gridRows = (grid: ReadonlyArray<ReadonlyArray<string>>): Rows => {
  const nonEmpty = grid.filter((row) => row.some((c) => c.trim() !== ""));
  const [first, ...rest] = nonEmpty;
  if (first === undefined) return [];
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const hasHeaders = looksLikeHeaders(first) && rest.length > 0;
  const headers = uniqueHeaders(
    hasHeaders
      ? Array.from({ length: width }, (_, i) => first.at(i) ?? "")
      : Array.from({ length: width }, () => ""),
  );
  return (hasHeaders ? rest : nonEmpty).slice(0, maxRows).map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, cellValue(cells.at(i) ?? "")]))
  );
};

/** Splits delimited text into cells, with quoted fields (doubled quotes, newlines in quotes). */
export const splitDelimited = (text: string, delimiter: string): Array<Array<string>> => {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let field = "";
  let quoted = false;
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (quoted) {
      if (c === '"' && input.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input.charAt(i + 1) === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const delimiters = [
  { char: "\t", format: "TSV" },
  { char: ",", format: "CSV" },
  { char: ";", format: "semicolon-separated text" },
  { char: "|", format: "pipe-separated text" },
] as const;

/**
 * The delimiter the text is split by, if any: the first (tabs first) that splits every
 * line into the same number of cells (two or more), over two lines or more. Strict, so
 * prose with a comma or two isn't taken for CSV.
 */
export const detectDelimiter = (text: string): (typeof delimiters)[number] | null =>
  delimiters.find((d) => {
    const rows = splitDelimited(text, d.char).filter((r) => r.some((c) => c.trim() !== ""));
    const width = rows.at(0)?.length ?? 0;
    return rows.length >= 2 && width >= 2 && rows.every((r) => r.length === width);
  }) ?? null;

const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

/** A JSON value as a row's value: nested objects and arrays as their JSON text. */
const jsonValue = (u: unknown): Value =>
  u === null || typeof u === "number" || typeof u === "boolean"
    ? u
    : typeof u === "string"
    ? u
    : JSON.stringify(u);

/** An object as a row, nested objects flattened into "a.b" fields (one level deep). */
const flatRow = (o: Record<string, unknown>): Row =>
  Object.fromEntries(
    Object.entries(o).flatMap(([k, v]) =>
      isRecord(v)
        ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, jsonValue(v2)] as const)
        : [[k, jsonValue(v)] as const]
    ),
  );

/** The rows a JSON value holds, in its common shapes; null if it isn't tabular. */
export const jsonRows = (json: unknown): Rows | null => {
  if (Array.isArray(json)) {
    if (json.length === 0) return null;
    if (json.every(isRecord)) return json.slice(0, maxRows).map(flatRow);
    if (json.every(Array.isArray)) {
      return gridRows(
        json.map((r: ReadonlyArray<unknown>) =>
          r.map((c) => c === null ? "" : typeof c === "string" ? c : JSON.stringify(c))
        ),
      );
    }
    if (json.every((v) => !isRecord(v) && !Array.isArray(v))) {
      return json.slice(0, maxRows).map((v, index) => ({ index, value: jsonValue(v) }));
    }
    return null;
  }
  if (!isRecord(json)) return null;
  const entries = Object.entries(json);
  if (entries.length === 0) return null;
  // { "data": [ {...}, ... ] }: the biggest list of objects in it.
  const lists = entries.filter(([, v]) => Array.isArray(v) && v.length > 0 && v.every(isRecord));
  const biggest = lists.sort((a, b) => (b[1] as unknown[]).length - (a[1] as unknown[]).length)
    .at(0);
  if (biggest !== undefined) return jsonRows(biggest[1]);
  // { "a": 3, "b": 5 }: a row per key.
  if (entries.every(([, v]) => !isRecord(v) && !Array.isArray(v))) {
    return entries.map(([key, v]) => ({ key, value: jsonValue(v) }));
  }
  // { "x": [1, 2], "y": [3, 4] }: columns of the same length.
  const columns = entries.filter(([, v]) => Array.isArray(v)) as Array<[string, unknown[]]>;
  const length = columns.at(0)?.[1].length ?? 0;
  if (columns.length === entries.length && columns.every(([, v]) => v.length === length)) {
    return Array.from(
      { length: Math.min(length, maxRows) },
      (_, i) => Object.fromEntries(columns.map(([k, v]) => [k, jsonValue(v.at(i))])),
    );
  }
  // { "alice": { ... }, "bob": { ... } }: a row per key.
  if (entries.every(([, v]) => isRecord(v))) {
    return entries.slice(0, maxRows).map(([key, v]) => ({
      key,
      ...flatRow(v as Record<string, unknown>),
    }));
  }
  return null;
};

/** The rows text holds, as JSON or delimited text, and what it looked like; null if none. */
const textRows = (
  text: string,
  types: ReadonlyArray<string>,
): { readonly format: string; readonly rows: Rows | null } => {
  if (text.startsWith("{") || text.startsWith("[") || types.includes("application/json")) {
    const json = parseJson(text);
    if (json.ok) {
      const rows = jsonRows(json.value);
      return { format: "JSON", rows: rows !== null && rows.length > 0 ? rows : null };
    }
  }
  const delimiter = detectDelimiter(text);
  if (delimiter !== null) {
    const rows = gridRows(splitDelimited(text, delimiter.char));
    if (rows.length > 0) return { format: delimiter.format, rows };
  }
  return { format: "text", rows: null };
};

/**
 * What a paste comes to, using its types as a hint; null when there's nothing in it to
 * chart. A table, or text that reads as rows, comes first: spreadsheets copy cells as
 * text and as a picture of them. Then an image, then any other text.
 */
export const readDump = (clip: Clip): Dump | null => {
  if (clip.table !== null) {
    const rows = gridRows(clip.table);
    if (rows.length > 0) return { is: "rows", format: "an HTML table", rows };
  }
  const text = clip.text.trim();
  const read = text === "" ? null : textRows(text, clip.types);
  if (read !== null && read.rows !== null) {
    return { is: "rows", format: read.format, rows: read.rows };
  }
  const imageFormat = clip.imageType === null ? undefined : imageFormats[clip.imageType];
  if (clip.imageType !== null && imageFormat !== undefined) {
    return { is: "image", format: imageFormat, type: clip.imageType };
  }
  return read === null ? null : { is: "text", format: read.format, text };
};

const parseJson = (text: string) =>
  Either.match(Either.try((): unknown => JSON.parse(text)), {
    onLeft: () => ({ ok: false } as const),
    onRight: (value) => ({ ok: true, value } as const),
  });

/** What was typed (or pasted into text already typed): the data in it, and what's asked. */
export type Typed = {
  /** What the user asked for: the text around the data. Empty if it's all data. */
  readonly request: string;
  readonly dump: Dump;
  /** The data's own text, as typed. */
  readonly original: string;
};

/**
 * Whether a line reads as a sentence, not a row of data: it ends like one, or has a
 * cell of more than five words. So a sentence with a comma isn't taken for a CSV row.
 */
export const isProse = (line: string): boolean =>
  /[.?:!]["')]?$/.test(line.trim()) ||
  line.split(/[,\t;|]/).some((cell) => cell.trim().split(/\s+/).length > 5);

/** How many lines of prose, before the data and after it, are looked through. */
const maxProseLines = 20;

/**
 * The data in typed text, and the request around it: the largest run of lines (after up
 * to 20 lines of prose, and before up to 20 more) that reads as rows, starting and
 * ending with lines that aren't sentences. All of it goes as
 * text, for the agent to make sense of, if no run does. Null if there's nothing.
 */
export const readTyped = (text: string): Typed | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const lines = trimmed.split(/\r?\n/);
  const n = lines.length;
  for (let start = 0; start <= Math.min(maxProseLines, n - 1); start++) {
    for (let end = n; end > start && end >= n - maxProseLines; end--) {
      const original = lines.slice(start, end).join("\n").trim();
      const edges = original.split("\n");
      if (original === "" || isProse(edges.at(0) ?? "") || isProse(edges.at(-1) ?? "")) continue;
      const dump = readDump({ types: [], table: null, text: original, imageType: null });
      if (dump?.is !== "rows") continue;
      const request = [...lines.slice(0, start), "", ...lines.slice(end)].join("\n").trim();
      return { request, dump, original };
    }
  }
  return { request: "", dump: { is: "text", format: "text", text: trimmed }, original: trimmed };
};
