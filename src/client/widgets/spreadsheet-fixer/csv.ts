/** Reading and writing CSV (RFC 4180): commas, quoted fields, doubled quotes, newlines in quotes. */

export type Rows = ReadonlyArray<ReadonlyArray<string>>;

/** The rows of a CSV text. A byte-order mark and a trailing newline are ignored. */
export const parseCsv = (text: string): Rows => {
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
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input.charAt(i + 1) === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const needsQuotes = /[",\r\n]|^\s|\s$/;

/** CSV text for rows, quoting fields only where needed, with a newline after each row. */
export const formatCsv = (rows: Rows): string =>
  rows.map((row) =>
    row.map((field) => needsQuotes.test(field) ? `"${field.replaceAll('"', '""')}"` : field)
      .join(",")
  ).join("\n") + "\n";
