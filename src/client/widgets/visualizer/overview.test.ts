import { assertEquals } from "@std/assert";
import { looksLikeDate, overview } from "./overview.ts";

Deno.test("dates are recognized in the forms Vega parses", () => {
  assertEquals(
    ["2024-01-05", "2024-01", "2024-01-05T10:00:00Z", "1/5/2024", "Jan 5, 2024", "5 Jan 2024"]
      .map(looksLikeDate),
    [true, true, true, true, true, true],
  );
  assertEquals(["2024", "hello", "13/45/2024x"].map(looksLikeDate), [false, false, false]);
});

Deno.test("an overview gives each field's kind, gaps, range and commonest values", () => {
  const result = overview([
    { day: "2024-01-02", n: 3, team: "a", ok: true },
    { day: "2024-01-01", n: 7, team: "b", ok: false },
    { day: "2024-01-03", n: null, team: "a", ok: true, blank: null },
  ], 1);
  assertEquals(result.rows, 3);
  assertEquals(result.firstRows.length, 1);
  assertEquals(result.fields.map((f) => [f.field, f.kind, f.missing, f.distinct]), [
    ["day", "date", 0, 3],
    ["n", "number", 1, 2],
    ["team", "text", 0, 2],
    ["ok", "boolean", 0, 2],
    ["blank", "empty", 3, 0],
  ]);
  assertEquals(result.fields.at(0)?.range, ["2024-01-01", "2024-01-03"]);
  assertEquals(result.fields.at(1)?.range, [3, 7]);
  assertEquals(result.fields.at(2)?.top, [{ value: "a", count: 2 }, { value: "b", count: 1 }]);
  assertEquals(result.fields.at(2)?.range, null);
});
