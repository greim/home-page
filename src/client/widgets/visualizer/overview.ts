/**
 * A summary of a data dump's rows for the agent: each field's likely type, how many
 * values are missing or distinct, its range or commonest values, and the first rows.
 * Enough to choose a chart without reading every row.
 */
import type { Rows, Value } from "./data.ts";

export type FieldKind = "number" | "date" | "boolean" | "text" | "empty";

export type FieldSummary = {
  readonly field: string;
  readonly kind: FieldKind;
  readonly missing: number;
  readonly distinct: number;
  /** For numbers and dates: the smallest and largest. */
  readonly range: readonly [Value, Value] | null;
  /** For text and booleans: the commonest values and their counts (up to 8). */
  readonly top: ReadonlyArray<{ readonly value: Value; readonly count: number }> | null;
};

export type Overview = {
  readonly rows: number;
  readonly fields: ReadonlyArray<FieldSummary>;
  readonly firstRows: Rows;
};

const isoDate =
  /^\d{4}-\d{2}(?:-\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const otherDate =
  /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2} [A-Za-z]{3,9}\.? \d{4})$/;

/** Whether text reads as a date (or a date and time) that Vega can parse. */
export const looksLikeDate = (text: string): boolean =>
  (isoDate.test(text) || otherDate.test(text)) && !Number.isNaN(Date.parse(text));

const kindOf = (values: ReadonlyArray<Value>): FieldKind => {
  const present = values.filter((v) => v !== null);
  if (present.length === 0) return "empty";
  if (present.every((v) => typeof v === "number")) return "number";
  if (present.every((v) => typeof v === "boolean")) return "boolean";
  if (present.every((v) => typeof v === "string" && looksLikeDate(v))) return "date";
  return "text";
};

const summarize = (field: string, values: ReadonlyArray<Value>): FieldSummary => {
  const kind = kindOf(values);
  const present = values.filter((v) => v !== null);
  const counts = new Map<Value, number>();
  for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
  const range = (): readonly [Value, Value] | null => {
    if (kind === "number") {
      const ns = present as ReadonlyArray<number>;
      return [Math.min(...ns), Math.max(...ns)];
    }
    if (kind === "date") {
      const sorted = [...present].sort((a, b) => Date.parse(String(a)) - Date.parse(String(b)));
      return [sorted.at(0) ?? null, sorted.at(-1) ?? null];
    }
    return null;
  };
  return {
    field,
    kind,
    missing: values.length - present.length,
    distinct: counts.size,
    range: range(),
    top: kind === "text" || kind === "boolean"
      ? [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({
        value,
        count,
      }))
      : null,
  };
};

/** The overview of `rows`, with its first `first` rows. */
export const overview = (rows: Rows, first = 5): Overview => {
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return {
    rows: rows.length,
    fields: fields.map((f) => summarize(f, rows.map((r) => r[f] ?? null))),
    firstRows: rows.slice(0, first),
  };
};
