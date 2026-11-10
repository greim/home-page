import { assertEquals, assertStringIncludes } from "@std/assert";
import { Schema } from "effect";
import {
  apiError,
  defineApi,
  link,
  linkPath,
  operation,
  readCallAnswer,
  readStreamLine,
  requestBody,
  splitLines,
  stream,
} from "./widget-apis.ts";

const NoMatch = apiError("no-match");
const Count = Schema.NumberFromString;

const api = defineApi("test", "main", {
  find: operation({
    input: Schema.Struct({ query: Schema.NonEmptyString }),
    output: Schema.Struct({ count: Count }),
    errors: NoMatch,
  }),
  watch: stream({ input: Schema.Struct({}), item: Count, errors: NoMatch }),
  file: link({ input: Schema.Struct({ name: Schema.String }) }),
});
const { find, watch, file } = api.operations;
const caller = { widgetType: "t", widgetId: "w1" };

Deno.test("an API's operations have their kinds, and calls a default size limit", () => {
  assertEquals([find.is, watch.is, file.is], ["call", "stream", "link"]);
  assertEquals(find.maxBytes, 200_000);
  assertEquals(api.services, []);
});

Deno.test("a request carries the caller and the encoded input, if it fits", () => {
  assertEquals(requestBody(find, caller, { query: "x" }), {
    ok: true,
    value: JSON.stringify({ caller, input: { query: "x" } }),
  });
  const misfit = requestBody(find, caller, { query: "" });
  assertEquals(misfit.ok ? "" : misfit.error.is, "bad-input");
});

Deno.test("a link's URL carries the caller and input as JSON", () => {
  const path = linkPath("test", "file", file, caller, { name: "a b.csv" });
  const url = new URL(path.ok ? path.value : "", "https://x");
  assertEquals(url.pathname, "/api/widget-apis/test/file");
  assertEquals(JSON.parse(url.searchParams.get("caller") ?? ""), caller);
  assertEquals(JSON.parse(url.searchParams.get("input") ?? ""), { name: "a b.csv" });
  assertEquals(linkPath("test", "file", file, caller, { name: 1 }).ok, false);
});

Deno.test("a call's answer is decoded: its value, its own error, or a failure", () => {
  assertEquals(readCallAnswer(find, 200, '{"ok":true,"value":{"count":"3"}}'), {
    ok: true,
    value: { count: 3 },
  });
  assertEquals(readCallAnswer(find, 200, '{"ok":false,"error":{"is":"no-match","message":"No"}}'), {
    ok: false,
    error: { is: "no-match", message: "No" },
  });
  assertEquals(readCallAnswer(find, 500, "It broke"), {
    ok: false,
    error: { is: "failed", message: "It broke" },
  });
  assertEquals(readCallAnswer(find, 404, " "), {
    ok: false,
    error: { is: "failed", message: "The server answered 404." },
  });
  const odd = readCallAnswer(find, 200, '{"ok":true,"value":{}}');
  assertEquals(odd.ok ? "" : odd.error.is, "bad-answer");
  const notJson = readCallAnswer(find, 200, "<html>");
  assertStringIncludes(notJson.ok ? "" : notJson.error.message, "isn't JSON");
});

Deno.test("a stream's lines are items, then how it ended", () => {
  assertEquals(readStreamLine(watch, '{"item":"2"}'), { is: "item", item: 2 });
  assertEquals(readStreamLine(watch, '{"end":{"ok":true}}'), {
    is: "end",
    result: { ok: true, value: null },
  });
  assertEquals(
    readStreamLine(watch, '{"end":{"ok":false,"error":{"is":"no-match","message":"No"}}}'),
    {
      is: "end",
      result: { ok: false, error: { is: "no-match", message: "No" } },
    },
  );
  assertEquals(
    readStreamLine(watch, '{"end":{"ok":false,"error":{"is":"failed","message":"Oops"}}}'),
    { is: "end", result: { ok: false, error: { is: "failed", message: "Oops" } } },
  );
  const odd = readStreamLine(watch, '{"item":"x"}');
  assertEquals(odd.is === "end" && !odd.result.ok ? odd.result.error.is : "", "bad-answer");
});

Deno.test("streamed text splits into whole lines, keeping any partial one", () => {
  assertEquals(splitLines("", '{"a":1}\n{"b"'), { lines: ['{"a":1}'], pending: '{"b"' });
  assertEquals(splitLines('{"b"', ":2}\n\n"), { lines: ['{"b":2}'], pending: "" });
});
