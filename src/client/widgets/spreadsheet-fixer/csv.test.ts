import { assertEquals } from "@std/assert";
import { formatCsv, parseCsv } from "./csv.ts";

Deno.test("CSV is read with quoted fields, doubled quotes and newlines inside quotes", () => {
  assertEquals(parseCsv('a,b\n"x, y","say ""hi"""\r\n"two\nlines",\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"'],
    ["two\nlines", ""],
  ]);
  assertEquals(parseCsv("﻿a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assertEquals(parseCsv(""), []);
});

Deno.test("CSV is written quoting only what needs it, and reads back the same", () => {
  const rows = [["name", "note"], ["Ann", 'said "hi", left'], [" pad", "x\ny"], ["", "plain"]];
  assertEquals(formatCsv(rows), 'name,note\nAnn,"said ""hi"", left"\n" pad","x\ny"\n,plain\n');
  assertEquals(parseCsv(formatCsv(rows)), rows);
});
