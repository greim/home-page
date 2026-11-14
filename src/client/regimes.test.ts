import { assertEquals } from "@std/assert";
import {
  largerRegimes,
  maxColumns,
  optimalWidth,
  pageRem,
  regimeQuery,
  regimeRootFontSizes,
  rootFontSizeFor,
  upperBoundary,
} from "./regimes.ts";

Deno.test("columns are 480px and gaps 20px at the middle of each regime", () => {
  assertEquals(pageRem(4), 101);
  assertEquals(optimalWidth(1), 520);
  assertEquals(optimalWidth(4), 2020);
});

Deno.test("regimes change midway between neighbors' optimal widths", () => {
  assertEquals(upperBoundary(1), 770);
  assertEquals(upperBoundary(3), 1770);
});

Deno.test("each regime above one column has a min-width query at its boundary", () => {
  assertEquals(regimeQuery(2), "(min-width: 770px)");
  assertEquals(regimeQuery(4), "(min-width: 1770px)");
  assertEquals(largerRegimes, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

Deno.test("root font size splits the viewport into the page's rems", () => {
  assertEquals(rootFontSizeFor(4), "calc(100vw / 101)");
});

Deno.test("regimeRootFontSizes has a default and a media query per larger regime", () => {
  const css = regimeRootFontSizes() as Record<string, unknown>;
  assertEquals(css.fontSize, "calc(100vw / 26)");
  assertEquals(css["@media (min-width: 770px)"], { fontSize: "calc(100vw / 51)" });
  assertEquals(Object.keys(css).length, maxColumns);
});
