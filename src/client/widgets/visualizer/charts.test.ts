import { assertEquals } from "@std/assert";
import {
  type Chart,
  describeData,
  imageName,
  inputFor,
  latest,
  maxHistory,
  newChart,
  tooBig,
  withAnswer,
  withEntry,
} from "./charts.ts";
import type { Dump } from "./data.ts";

const rows = [{ a: 1 }, { a: 2 }];
const pasted = (data: Dump, original: string, image: Blob | null = null) =>
  newChart({ id: "c1", widgetId: "w1", data, original, image, now: 5 });
const chart = pasted({ is: "rows", format: "CSV", rows }, "a\n1\n2");
const version = { spec: { mark: "bar" }, svg: "<svg/>" };
const answer = { title: " Sales ", reply: "A bar chart.", rendered: true };

Deno.test("a first chart's input has the data's form and no current chart", () => {
  assertEquals(inputFor(chart, ""), {
    request: "",
    format: "CSV",
    hasRows: true,
    text: null,
    image: null,
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

Deno.test("an image is sent as a file, and the rows read from it replace it", () => {
  const png = new Blob([new Uint8Array(10)], { type: "image/png" });
  const fromImage = pasted({ is: "image", format: "a PNG image", type: "image/png" }, "", png);
  assertEquals(inputFor(fromImage, "").image, "image.png");
  assertEquals(imageName("image/jpeg"), "image.jpg");
  assertEquals(withAnswer(fromImage, answer, version, rows).data.is, "rows");
  assertEquals(describeData(fromImage.data), "a PNG image");
  assertEquals(tooBig(fromImage.data, "", png), null);
  const huge = new Blob([new Uint8Array(6_000_000)], { type: "image/png" });
  assertEquals(
    tooBig(fromImage.data, "", huge),
    "That image is too big to chart (6 MB; at most 5 MB).",
  );
});

Deno.test("rows the agent read from text replace the text", () => {
  const fromText = pasted({ is: "text", format: "text", text: "a is 1" }, "a is 1");
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
  assertEquals(tooBig(chart.data, chart.original, null), null);
  assertEquals(
    tooBig(
      { is: "text", format: "text", text: "x".repeat(2_000_000) },
      "x".repeat(1_000_000),
      null,
    ),
    "That's too much data to chart (3 MB; at most 2 MB).",
  );
});
