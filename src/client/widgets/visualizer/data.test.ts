import { assertEquals } from "@std/assert";
import {
  cellValue,
  detectDelimiter,
  gridRows,
  isProse,
  jsonRows,
  readDump,
  readTyped,
  splitDelimited,
  uniqueHeaders,
} from "./data.ts";

const clip = (
  text: string,
  table: ReadonlyArray<ReadonlyArray<string>> | null = null,
  imageType: string | null = null,
) => ({ types: ["text/plain"], table, text, imageType });

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

Deno.test("an image is charted unless there's text that reads as rows", () => {
  const png = { is: "image", format: "a PNG image", type: "image/png" } as const;
  assertEquals(readDump(clip("", null, "image/png")), png);
  assertEquals(readDump(clip("A screenshot", null, "image/png")), png);
  assertEquals(readDump(clip("k\tv\na\t1", null, "image/png"))?.is, "rows");
  assertEquals(readDump(clip("", null, "image/tiff")), null);
  assertEquals(readDump(clip("hi", null, "image/tiff"))?.is, "text");
});

Deno.test("delimited text must split every line evenly", () => {
  assertEquals(detectDelimiter("a,b\n1,2\n3"), null);
  assertEquals(detectDelimiter("I went, then\ncame back, and left, and"), null);
});

Deno.test("sentences aren't rows", () => {
  assertEquals(
    [
      "Here's some CSV, can you chart it?",
      "Chart this:",
      "a, b, c",
      "one two three four five six, x",
    ]
      .map(isProse),
    [true, true, false, true],
  );
});

Deno.test("typed text is split into the data and the request around it", () => {
  const csv = "name,score\nann,3\nbo,5";
  const rows = [{ name: "ann", score: 3 }, { name: "bo", score: 5 }];
  assertEquals(readTyped(`Here's some CSV data, can you chart it by score?\n\n${csv}\n`), {
    request: "Here's some CSV data, can you chart it by score?",
    dump: { is: "rows", format: "CSV", rows },
    original: csv,
  });
  assertEquals(
    readTyped(`Chart this:\n${csv}\n\nAs a pie, please.`)?.request,
    "Chart this:\n\nAs a pie, please.",
  );
  assertEquals(readTyped(`[{"a":1}]\nsorted`), {
    request: "sorted",
    dump: { is: "rows", format: "JSON", rows: [{ a: 1 }] },
    original: '[{"a":1}]',
  });
  assertEquals(readTyped(csv)?.request, "");
  assertEquals(readTyped("Sales were 5 in May, and 7 in June."), {
    request: "",
    dump: { is: "text", format: "text", text: "Sales were 5 in May, and 7 in June." },
    original: "Sales were 5 in May, and 7 in June.",
  });
  assertEquals(readTyped(" \n "), null);
});
