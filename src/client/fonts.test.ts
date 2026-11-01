import { assertEquals } from "@std/assert";
import { defaultSkin, type Font } from "../common/model.ts";
import { fontStack, googleFontsUrl } from "./fonts.ts";

const google = (name: string): Font => ({ is: "google", name, fallback: "sans-serif" });

Deno.test("fontStack quotes the name and falls back to its generic family", () => {
  assertEquals(fontStack(google("Open Sans")), `"Open Sans", sans-serif`);
  assertEquals(
    fontStack({ is: "system", name: "Helvetica Neue", fallback: "sans-serif" }),
    `"Helvetica Neue", sans-serif`,
  );
  assertEquals(fontStack({ is: "system", name: null, fallback: "serif" }), "serif");
});

Deno.test("googleFontsUrl is null when the skin uses no Google fonts", () => {
  const system: Font = { is: "system", name: null, fallback: "sans-serif" };
  assertEquals(
    googleFontsUrl({ ...defaultSkin, headingFont: system, bodyFont: system, codeFont: system }),
    null,
  );
});

Deno.test("the default skin loads Open Sans and Source Code Pro", () => {
  const url = googleFontsUrl(defaultSkin) ?? "";
  assertEquals(url.match(/family=[\w+]+/g), ["family=Open+Sans", "family=Source+Code+Pro"]);
});

Deno.test("googleFontsUrl asks for each Google font once, in every weight and style", () => {
  const url = googleFontsUrl({
    ...defaultSkin,
    headingFont: google("Archivo Black"),
    bodyFont: google("Open Sans"),
    codeFont: { is: "google", name: "Open Sans", fallback: "monospace" },
  });
  const styles = "ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;" +
    "1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900";
  assertEquals(
    url,
    `https://fonts.googleapis.com/css2?family=Archivo+Black:${styles}` +
      `&family=Open+Sans:${styles}&display=swap`,
  );
});
