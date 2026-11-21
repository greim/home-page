import { assertEquals } from "@std/assert";
import {
  cellValue,
  detectDelimiter,
  gridRows,
  jsonRows,
  readDump,
  splitDelimited,
  uniqueHeaders,
} from "./data.ts";

const clip = (text: string, table: ReadonlyArray<ReadonlyArray<string>> | null = null) => ({
  types: ["text/plain"],
  table,
  text,
});

Deno.test("cells become numbers, booleans, nulls or trimmed text", () => {
  assertEquals(
    ["12", " 1,234.5 ", "$9.99", "45%", "-3e2", "TRUE", "false", "", "n/a", " hi ", "1,2", "12a"]
      .map(cellValue),
    [12, 1234.5, 9.99, 45, -300, true, false, null, null, "hi", "1,2", "12a"],
  );
});

Deno.test("headers are made unique and never blank", () => {
  assertEquals(uniqueHeaders(["a", "", "a", " b "]), ["a", "Column 2", "a 2", "b"]);
});

Deno.test("a grid's first row is its headers only if it looks like them", () => {
  assertEquals(gridRows([["name", "n"], ["x", "1"], ["", ""]]), [{ name: "x", n: 1 }]);
  assertEquals(gridRows([["2020", "1"], ["2021", "2"]]), [
    { "Column 1": 2020, "Column 2": 1 },
    { "Column 1": 2021, "Column 2": 2 },
  ]);
  assertEquals(gridRows([]), []);
});

Deno.test("delimited text splits with quotes, doubled quotes and newlines in quotes", () => {
  assertEquals(splitDelimited('﻿a,"b, c"\r\n"say ""hi""","x\ny"\n', ","), [
    ["a", "b, c"],
    ['say "hi"', "x\ny"],
  ]);
});

Deno.test("the delimiter is the one that splits lines evenly", () => {
  assertEquals(detectDelimiter("a\tb\n1\t2")?.format, "TSV");
  assertEquals(detectDelimiter("a,b\n1,2\n3,4")?.format, "CSV");
  assertEquals(detectDelimiter("a;b\n1;2")?.format, "semicolon-separated text");
  assertEquals(detectDelimiter("Sales went up, then down.\nThen up again."), null);
  assertEquals(detectDelimiter("just one line, with a comma"), null);
});

Deno.test("JSON in its common shapes becomes rows", () => {
  assertEquals(jsonRows([{ a: 1, b: { c: 2 }, d: [1] }]), [{ a: 1, "b.c": 2, d: "[1]" }]);
  assertEquals(jsonRows([["x", "y"], ["a", 1], ["b", null]]), [
    { x: "a", y: 1 },
    { x: "b", y: null },
  ]);
  assertEquals(jsonRows([3, "a"]), [{ index: 0, value: 3 }, { index: 1, value: "a" }]);
  assertEquals(jsonRows({ meta: 1, data: [{ a: 1 }], other: [{ b: 1 }, { b: 2 }] }), [
    { b: 1 },
    { b: 2 },
  ]);
  assertEquals(jsonRows({ a: 3, b: "x" }), [{ key: "a", value: 3 }, { key: "b", value: "x" }]);
  assertEquals(jsonRows({ x: [1, 2], y: [3, 4] }), [{ x: 1, y: 3 }, { x: 2, y: 4 }]);
  assertEquals(jsonRows({ al: { age: 3 }, bo: { age: 4 } }), [
    { key: "al", age: 3 },
    { key: "bo", age: 4 },
  ]);
  assertEquals(jsonRows([]), null);
  assertEquals(jsonRows([1, { a: 1 }]), null);
  assertEquals(jsonRows("x"), null);
  assertEquals(jsonRows({}), null);
  assertEquals(jsonRows({ x: [1], y: 2 }), null);
});

Deno.test("a paste is read as a table, JSON, delimited text, or left as text", () => {
  assertEquals(readDump(clip("ignored", [["k", "v"], ["a", "1"]])), {
    is: "rows",
    format: "an HTML table",
    rows: [{ k: "a", v: 1 }],
  });
  assertEquals(readDump(clip('[{"a":1}]')), { is: "rows", format: "JSON", rows: [{ a: 1 }] });
  assertEquals(readDump(clip('"just a string"')), {
    is: "text",
    format: "text",
    text: '"just a string"',
  });
  assertEquals(readDump(clip("[1, {}]")), { is: "text", format: "JSON", text: "[1, {}]" });
  assertEquals(readDump(clip("{oops")), { is: "text", format: "text", text: "{oops" });
  assertEquals(readDump(clip("k,v\na,1\n")), {
    is: "rows",
    format: "CSV",
    rows: [{ k: "a", v: 1 }],
  });
  assertEquals(readDump(clip("Q1 was 5, Q2 was 7")), {
    is: "text",
    format: "text",
    text: "Q1 was 5, Q2 was 7",
  });
  assertEquals(readDump(clip("  ")), null);
});
