import { assertEquals } from "@std/assert";
import {
  type Chart,
  describeData,
  inputFor,
  latest,
  maxHistory,
  newChart,
  tooBig,
  withAnswer,
  withEntry,
} from "./charts.ts";

const rows = [{ a: 1 }, { a: 2 }];
const chart = newChart("c1", "w1", { is: "rows", format: "CSV", rows }, 5);
const version = { spec: { mark: "bar" }, columnSvg: "<svg/>", fullSvg: "<svg/>" };
const answer = { title: " Sales ", reply: "A bar chart.", rendered: true };

Deno.test("a first chart's input has the data's form and no current chart", () => {
  assertEquals(inputFor(chart, ""), {
    request: "",
    format: "CSV",
    hasRows: true,
    text: null,
    current: null,
    history: [],
  });
});

Deno.test("a refinement is given the version chosen and the conversation, without notes", () => {
  let c: Chart = withAnswer(chart, answer, version, null);
  c = withEntry(c, { is: "note", text: "Stopped." });
  c = withAnswer(c, { ...answer, title: "" }, { ...version, spec: { mark: "line" } }, null);
  const input = inputFor(c, "sort it", 0);
  assertEquals(input.current, { title: "Sales", spec: { mark: "bar" } });
  assertEquals(input.history, [
    { from: "visualizer", text: "A bar chart." },
    { from: "visualizer", text: "A bar chart." },
  ]);
  assertEquals(inputFor(c, "x").current?.spec, { mark: "line" });
  assertEquals(latest(c)?.spec, { mark: "line" });
  assertEquals(latest(chart), null);
});

Deno.test("history is capped", () => {
  let c: Chart = chart;
  for (let i = 0; i < maxHistory + 3; i++) c = withEntry(c, { is: "user", text: String(i) });
  assertEquals(inputFor(c, "").history.length, maxHistory);
});

Deno.test("rows the agent read from text replace the text", () => {
  const fromText = newChart("c2", "w1", { is: "text", format: "text", text: "a is 1" }, 5);
  assertEquals(inputFor(fromText, "").text, "a is 1");
  const answered = withAnswer(fromText, answer, version, rows);
  assertEquals(answered.data, { is: "rows", format: "text", rows });
  assertEquals(withAnswer(chart, answer, null, [{ a: 9 }]).data, chart.data);
  assertEquals(withAnswer(chart, answer, null, null).versions, []);
});

Deno.test("data is described, and too much is refused", () => {
  assertEquals(describeData(chart.data), "2 rows of CSV");
  assertEquals(describeData({ is: "rows", format: "JSON", rows: [{}] }), "1 row of JSON");
  assertEquals(describeData({ is: "text", format: "text", text: "abc" }), "text, 3 characters");
  assertEquals(tooBig(chart.data), null);
  assertEquals(
    tooBig({ is: "text", format: "text", text: "x".repeat(3_000_000) }),
    "That's too much data to chart (3 MB; at most 2 MB).",
  );
});
