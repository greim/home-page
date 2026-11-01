import { assertEquals } from "@std/assert";
import { defaultSkin } from "../common/model.ts";
import { codeTextSpacing, shadowCss, skinVars } from "./skin.ts";

Deno.test("skinVars sets lengths in rem and leaves line height unitless", () => {
  const vars = skinVars(defaultSkin);
  assertEquals(vars["--skin-text-spacing"], "1.7");
  assertEquals(vars["--skin-gap"], "1.6rem");
  assertEquals(vars["--skin-corner-radius"], "1.6rem");
  assertEquals(vars["--skin-column-padding-x"], "1.2rem");
});

Deno.test("skinVars skews column padding: less on top, more at the bottom", () => {
  const vars = skinVars({ ...defaultSkin, columnPadding: 2 });
  assertEquals(vars["--skin-column-padding-top"], "1.75rem");
  assertEquals(vars["--skin-column-padding-bottom"], "2.25rem");
});

Deno.test("skinVars never makes the top padding negative", () => {
  assertEquals(
    skinVars({ ...defaultSkin, columnPadding: 0.25 })["--skin-column-padding-top"],
    "0rem",
  );
});

Deno.test("skinVars passes fonts and weights through, and opacities as percentages", () => {
  const vars = skinVars({
    ...defaultSkin,
    headingFont: { is: "system", name: "Georgia", fallback: "serif" },
    codeFont: { is: "google", name: "Fira Code", fallback: "monospace" },
    columnHeadingWeight: 700,
    columnHeadingOpacity: 0.4,
    widgetHeadingOpacity: 1,
  });
  assertEquals(vars["--skin-heading-font"], `"Georgia", serif`);
  assertEquals(vars["--skin-body-font"], `"Open Sans", sans-serif`);
  assertEquals(vars["--skin-code-font"], `"Fira Code", monospace`);
  assertEquals(vars["--skin-column-heading-weight"], "700");
  assertEquals(vars["--skin-column-heading-alpha"], "40%");
  assertEquals(vars["--skin-widget-heading-weight"], "500");
  assertEquals(vars["--skin-widget-heading-alpha"], "100%");
});

Deno.test("shadowCss falls the shadow below by its distance, scaled", () => {
  const shadow = { blur: 2, distance: 1, opacity: 0.5, angle: 0 };
  assertEquals(shadowCss(shadow, 1), "0rem 1rem 2rem rgba(0, 0, 0, 0.5)");
  assertEquals(shadowCss(shadow, 0.5), "0rem 0.5rem 1rem rgba(0, 0, 0, 0.5)");
});

Deno.test("shadowCss falls the shadow away from the light's angle", () => {
  const shadow = { blur: 2, distance: 2, opacity: 0.5, angle: 35 };
  // Light 35° west of overhead: the shadow falls down and to the east.
  assertEquals(shadowCss(shadow, 1), "1.1472rem 1.6383rem 2rem rgba(0, 0, 0, 0.5)");
  assertEquals(shadowCss({ ...shadow, angle: 90 }, 1), "2rem 0rem 2rem rgba(0, 0, 0, 0.5)");
  assertEquals(shadowCss({ ...shadow, angle: -90 }, 1), "-2rem 0rem 2rem rgba(0, 0, 0, 0.5)");
  assertEquals(
    shadowCss(shadow, 0.5, true),
    "inset 0.5736rem 0.8192rem 1rem rgba(0, 0, 0, 0.5)",
  );
});

Deno.test("skinVars scales the thumbnail shadow down from the column shadow", () => {
  const vars = skinVars({
    ...defaultSkin,
    columnShadow: { blur: 2, distance: 1, opacity: 0.3, angle: 0 },
  });
  assertEquals(vars["--skin-column-shadow"], "0rem 1rem 2rem rgba(0, 0, 0, 0.3)");
  assertEquals(vars["--skin-thumb-shadow"], "0rem 0.4rem 0.8rem rgba(0, 0, 0, 0.3)");
  // The inset shadow is lighter too: 70% of the column shadow's opacity.
  assertEquals(vars["--skin-inset-shadow"], "inset 0rem 0.2rem 0.4rem rgba(0, 0, 0, 0.21)");
  // The faint inset shadow is half the size, at 30% of the column shadow's opacity.
  assertEquals(
    vars["--skin-faint-inset-shadow"],
    "inset 0rem 0.1rem 0.2rem rgba(0, 0, 0, 0.09)",
  );
});

Deno.test("skinVars rounds away floating-point noise", () => {
  const vars = skinVars({
    ...defaultSkin,
    columnShadow: { blur: 1.6, distance: 1.6, opacity: 0.5, angle: 0 },
    columnHeadingOpacity: 0.57,
  });
  assertEquals(vars["--skin-thumb-shadow"], "0rem 0.64rem 0.64rem rgba(0, 0, 0, 0.5)");
  assertEquals(vars["--skin-column-heading-alpha"], "57%");
});

Deno.test("codeTextSpacing sets code tighter than text, and solid text stays solid", () => {
  assertEquals(codeTextSpacing(1.7), 1.4);
  assertEquals(codeTextSpacing(1), 1);
  assertEquals(codeTextSpacing(2.4), 1.8);
  assertEquals(skinVars(defaultSkin)["--skin-code-text-spacing"], "1.4");
});
