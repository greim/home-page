import { assertEquals, assertThrows } from "@std/assert";
import {
  apply,
  fixedName,
  fromSheet,
  type Operation,
  overview,
  toIsoDate,
  toSheet,
} from "./sheet.ts";

const sheet = toSheet([
  ["Name", "Joined", "City"],
  [" ann lee ", "3/7/2026", "denver"],
  ["Bo", "Mar 7, 2026", "DENVER"],
  ["", "", ""],
  ["Bo", "Mar 7, 2026", "DENVER"],
  ["Cy", "soon", "Boulder", "extra"],
]);

const after = (...operations: ReadonlyArray<Operation>) =>
  operations.reduce((s, op) => apply(s, op).sheet, sheet);

Deno.test("an overview shows the sheet's shape and its likely problems", () => {
  const o = overview(sheet, 2);
  assertEquals([o.rows, o.emptyRows, o.duplicateRows, o.raggedRows], [5, 1, 1, 1]);
  assertEquals(o.columns.at(0), {
    name: "Name",
    empty: 1,
    distinct: 3,
    padded: 1,
    samples: [" ann lee ", "Bo", "Cy"],
  });
  assertEquals(o.firstRows.length, 2);
});

Deno.test("dates in common forms become YYYY-MM-DD", () => {
  assertEquals(toIsoDate("2026-03-07"), "2026-03-07");
  assertEquals(toIsoDate("2026/3/7"), "2026-03-07");
  assertEquals(toIsoDate("3/7/2026"), "2026-03-07");
  assertEquals(toIsoDate("3/7/26"), "2026-03-07");
  assertEquals(toIsoDate("Mar 7, 2026"), "2026-03-07");
  assertEquals(toIsoDate("7 March 2026"), "2026-03-07");
  assertEquals(toIsoDate("2/30/2026"), null);
  assertEquals(toIsoDate("Smarch 7, 2026"), null);
  assertEquals(toIsoDate("soon"), null);
});

Deno.test("cleanups: trimming, case, replacing, dates", () => {
  const fixed = after(
    { op: "trim_whitespace", column: "*" },
    { op: "set_case", column: "Name", case: "title" },
    { op: "set_case", column: "City", case: "title" },
    { op: "format_dates", column: "Joined" },
    { op: "replace", column: "City", from: "Boulder", to: "Boulder, CO" },
  );
  assertEquals(fixed.rows.at(0), ["Ann Lee", "2026-03-07", "Denver"]);
  assertEquals(fixed.rows.at(4), ["Cy", "soon", "Boulder, CO", "extra"]);
  assertEquals(
    apply(sheet, { op: "format_dates", column: "Joined" }).note,
    `Reformatted 3 dates in "Joined"; 1 weren't dates it could read, and were left`,
  );
  assertEquals(
    apply(sheet, { op: "set_case", column: "City", case: "upper" }).sheet.rows.at(0)?.at(2),
    "DENVER",
  );
  assertEquals(
    apply(sheet, { op: "set_case", column: "City", case: "lower" }).sheet.rows.at(1)?.at(2),
    "denver",
  );
});

Deno.test("trimming says when it trimmed headers too, since later changes name them", () => {
  const padded = toSheet([[" Name ", "City"], ["a", "b"]]);
  assertEquals(
    apply(padded, { op: "trim_whitespace", column: "*" }).note,
    "Trimmed spaces in 0 cells and 1 headers (now Name, City)",
  );
});

Deno.test("structure: rows, columns and cells", () => {
  const deduped = after({ op: "drop_empty_rows" }, { op: "drop_duplicate_rows" });
  assertEquals(deduped.rows.length, 3);
  const renamed = after({ op: "rename_column", column: "City", to: "Town" }, {
    op: "drop_column",
    column: "Joined",
  });
  assertEquals(renamed.headers, ["Name", "Town"]);
  assertEquals(renamed.rows.at(4), ["Cy", "Boulder", "extra"]);
  assertEquals(
    after({ op: "set_cell", row: 3, column: "Name", value: "Di" }).rows.at(2)?.at(0),
    "Di",
  );
  const split = after({
    op: "split_column",
    column: "Name",
    separator: " ",
    into: ["First", "Last"],
  });
  assertEquals(split.headers, ["First", "Last", "Joined", "City"]);
  assertEquals(split.rows.at(0)?.slice(0, 2), ["", "ann lee"]);
  assertEquals(split.rows.at(1)?.slice(0, 2), ["Bo", ""]);
});

Deno.test("a change that can't be made says why", () => {
  assertThrows(
    () => apply(sheet, { op: "drop_column", column: "Nope" }),
    Error,
    `no column "Nope"`,
  );
  assertThrows(
    () => apply(sheet, { op: "set_cell", row: 9, column: "Name", value: "" }),
    Error,
    "no row 9",
  );
});

Deno.test("the fixed copy keeps the headers first, and its own name", () => {
  assertEquals(fromSheet(toSheet([["a"], ["1"]])), [["a"], ["1"]]);
  assertEquals(toSheet([]), { headers: [], rows: [] });
  assertEquals(fixedName("Leads.CSV"), "Leads-fixed.csv");
  assertEquals(fixedName("leads"), "leads-fixed.csv");
});
