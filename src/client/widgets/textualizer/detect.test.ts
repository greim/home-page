import { assertEquals } from "@std/assert";
import { bestGuess, detect, scores } from "./detect.ts";
import type { Kind } from "./source.ts";

/** Samples of each kind, as people copy them, and what each should be detected as. */
const fixtures: ReadonlyArray<readonly [string, string, Kind | null]> = [
  [
    "TypeScript module",
    `import { Schema } from "effect";

export const Config = Schema.Struct({
  heading: Schema.String,
});

export function greet(name: string): string {
  if (name === "") return "Hello";
  return \`Hello, \${name}\`;
}`,
    "script",
  ],
  [
    "JavaScript snippet",
    `const items = document.querySelectorAll(".item");
items.forEach((item) => {
  item.addEventListener("click", () => console.log(item.id));
});`,
    "script",
  ],
  [
    "TSX component",
    `import { useState } from "react";

export function Counter() {
  const [n, setN] = useState(0);
  return (
    <button onClick={() => setN(n + 1)}>
      <span>{n}</span>
    </button>
  );
}`,
    "script",
  ],
  [
    "JSON object",
    `{
  "name": "home-page",
  "version": 1,
  "columns": [{ "id": "a", "widgets": [] }]
}`,
    "json",
  ],
  ["JSON array", `[1, 2, {"a": true}]`, "json"],
  [
    "HTML document",
    `<!DOCTYPE html>
<html><head><title>Hi</title></head><body><p>Hello</p></body></html>`,
    "html",
  ],
  [
    "HTML fragment",
    `<div class="card">
  <h2>Title</h2>
  <p>Some <strong>bold</strong> text.</p>
  <ul>
    <li>One</li>
    <li>Two</li>
  </ul>
</div>`,
    "html",
  ],
  [
    "Markdown README",
    `# Project

Some intro text with a [link](https://example.com).

## Install

- Run \`deno task setup\`
- Open the page`,
    "markdown",
  ],
  [
    "Markdown with a code block",
    `Here's how:

\`\`\`ts
const a = 1;
export function f() {
  return a;
}
\`\`\`

That's it.`,
    "markdown",
  ],
  [
    "Markdown table",
    `| Name | Age |
| ---- | --- |
| Ann  | 30  |`,
    "markdown",
  ],
  [
    "plain prose",
    `I went to the store yesterday. It was closed, so I came home.

Tomorrow I'll try again, maybe in the morning (when it opens).`,
    null,
  ],
  ["a short list", `- eggs\n- milk\n- bread`, null],
  // Not JSON, but a fine JavaScript object literal.
  ["JSON with a trailing comma", `{"a": 1,}`, "script"],
];

for (const [name, text, kind] of fixtures) {
  Deno.test(`detect: ${name}`, () => {
    assertEquals(detect(text), kind, JSON.stringify(scores(text)));
  });
}

Deno.test("detect: nothing in empty text", () => {
  assertEquals(detect(""), null);
  assertEquals(detect("   \n  "), null);
});

Deno.test("bestGuess: the top scorer, even below the threshold", () => {
  assertEquals(bestGuess("- eggs\n- milk"), "markdown");
  assertEquals(bestGuess("total(x)\nlater on"), "script");
});

Deno.test("bestGuess: Markdown when nothing scores", () => {
  assertEquals(bestGuess("Just a sentence."), "markdown");
  assertEquals(bestGuess(""), "markdown");
});

Deno.test("scores: tags without closing tags don't make HTML", () => {
  assertEquals(scores("a <b> c").html, 0);
});
