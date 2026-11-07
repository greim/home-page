import { assertEquals } from "@std/assert";
import { labelRight, percent, workdayTitle } from "./workday.ts";

Deno.test("workdayTitle names each part of the week", () => {
  assertEquals(workdayTitle("workday"), "Workday");
  assertEquals(workdayTitle("after-hours"), "After Hours");
  assertEquals(workdayTitle("weekend"), "Weekend");
});

Deno.test("percent rounds down, and stays between 0 and 100", () => {
  assertEquals(percent(0.809), 80);
  assertEquals(percent(0.999), 99);
  assertEquals(percent(1), 100);
  assertEquals(percent(-0.1), 0);
  assertEquals(percent(1.5), 100);
});

// A 200-wide bar with a 30-wide label, 10 from the end, kept 5 from the fill's edge.
const layout = { track: 200, label: 30, inset: 10, gap: 5 };
const right = (progress: number) => labelRight({ ...layout, progress });

Deno.test("the label sits at the bar's end while the fill is short of it", () => {
  assertEquals(right(0), 10);
  assertEquals(right(0.5), 10);
  // The label starts at 160; the fill stops 5 short of it at 155.
  assertEquals(right(0.77), 10);
});

Deno.test("once the fill reaches the label, it moves inside the fill, left of the edge", () => {
  // At 156 the fill is within 5 of the label: the label's right edge goes to 151.
  assertEquals(right(0.78), 49);
  assertEquals(right(0.9), 25);
  // Full, it sits at its usual place, inside the fill.
  assertEquals(right(1), 10);
});

Deno.test("the label never covers the fill's edge", () => {
  for (let p = 0; p <= 1; p += 0.01) {
    const labelEnd = layout.track - right(p);
    const labelStart = labelEnd - layout.label;
    const edge = p * layout.track;
    const clear = edge <= labelStart - layout.gap || edge >= labelEnd + layout.gap ||
      p >= 0.999;
    assertEquals(clear, true, `at ${p.toFixed(2)}`);
  }
});
