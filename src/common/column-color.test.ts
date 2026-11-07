import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { Either, Schema } from "effect";
import {
  chromaGradient,
  chromaLimit,
  ColumnColor,
  columnColorCss,
  columnColorPresets,
  fromHex,
  hueGradient,
  maxChroma,
  sameColumnColor,
  StoredColumnColor,
  toHex,
  withChroma,
  withHue,
} from "./column-color.ts";

Deno.test("columnColorCss puts the chroma and hue at the column lightness", () => {
  assertEquals(columnColorCss({ c: 0.0185455, h: 104.283 }), "oklch(0.63553 0.0185455 104.283)");
});

Deno.test("ColumnColor accepts chroma up to the limit and hues from 0 up to 360", () => {
  const decode = Schema.decodeUnknownEither(ColumnColor);
  assert(Either.isRight(decode({ c: 0, h: 0 })));
  assert(Either.isRight(decode({ c: chromaLimit, h: 359.9 })));
  for (const bad of [{ c: -0.01, h: 0 }, { c: 0.5, h: 0 }, { c: 0, h: 360 }, { c: 0, h: -1 }]) {
    assert(Either.isLeft(decode(bad)), JSON.stringify(bad));
  }
});

Deno.test("maxChroma differs by hue, and every preset is within it", () => {
  // Blues reach less chroma than greens at this lightness, but all reach well past the presets'.
  assert(maxChroma(250) < maxChroma(140));
  for (const preset of columnColorPresets) {
    assert(preset.c <= maxChroma(preset.h), JSON.stringify(preset));
  }
  // Just past the limit is out of sRGB: the edge round-trips to a hex color within a step.
  for (const h of [0, 90, 180, 270]) {
    const edge = { c: maxChroma(h), h };
    assertAlmostEquals(fromHex(toHex(edge)).c, edge.c, 0.01);
  }
});

Deno.test("withHue keeps the chroma when the new hue can reach it, and lowers it otherwise", () => {
  assertEquals(withHue({ c: 0.02, h: 10 }, 200), { c: 0.02, h: 200 });
  const vivid = { c: maxChroma(140), h: 140 };
  assertEquals(withHue(vivid, 250), { c: maxChroma(250), h: 250 });
  assertEquals(withHue({ c: 0.02, h: 10 }, 360).h, 0);
  assertEquals(withHue({ c: 0.02, h: 10 }, -90).h, 270);
});

Deno.test("withChroma keeps the chroma between none and the most the hue reaches", () => {
  assertEquals(withChroma({ c: 0.02, h: 30 }, 0.05), { c: 0.05, h: 30 });
  assertEquals(withChroma({ c: 0.02, h: 30 }, -1), { c: 0, h: 30 });
  assertEquals(withChroma({ c: 0.02, h: 30 }, 1), { c: maxChroma(30), h: 30 });
});

Deno.test("fromHex keeps a color's chroma and hue, at the column lightness", () => {
  for (const preset of columnColorPresets) {
    const back = fromHex(toHex(preset));
    // Hex has 8 bits a channel, so expect a little drift: in hue most of all, since
    // these are nearly gray (at c 0.011, one step of a channel turns the hue ~7°).
    assertAlmostEquals(back.c, preset.c, 0.003);
    assertAlmostEquals(back.h, preset.h, 10);
  }
  assertEquals(fromHex("#ffffff"), { c: 0, h: 0 });
  assertEquals(fromHex("#000000"), { c: 0, h: 0 });
});

Deno.test("fromHex lowers chroma a hue can't reach at the column lightness", () => {
  const blue = fromHex("#0000ff");
  assertEquals(blue.c, maxChroma(blue.h));
});

const decodeStored = Schema.decodeUnknownEither(StoredColumnColor);
const encodeStored = Schema.encodeSync(StoredColumnColor);

Deno.test("StoredColumnColor reads { c, h } and older #rrggbb colors, and saves { c, h }", () => {
  assertEquals(decodeStored({ c: 0.02, h: 30 }), Either.right({ c: 0.02, h: 30 }));
  assertEquals(decodeStored("#A0b1C2"), Either.right(fromHex("#A0b1C2")));
  assertEquals(encodeStored(fromHex("#A0b1C2")), fromHex("#A0b1C2"));
  for (const bad of ["red", "#fff", { c: 0.02 }, null]) {
    assert(Either.isLeft(decodeStored(bad)), JSON.stringify(bad));
  }
});

Deno.test("hueGradient runs through every hue, staying in sRGB", () => {
  const gradient = hueGradient();
  assert(gradient.startsWith("linear-gradient(to right, oklch(0.63553 "));
  assertEquals(gradient.match(/oklch\(/g)?.length, 13);
  assert(gradient.includes(" 0)") && gradient.includes(" 360)"));
});

Deno.test("chromaGradient runs from gray to the hue's most chroma", () => {
  assertEquals(
    chromaGradient(30),
    `linear-gradient(to right, oklch(0.63553 0 30), oklch(0.63553 ${maxChroma(30)} 30))`,
  );
});

Deno.test("sameColumnColor compares chroma and hue", () => {
  assert(sameColumnColor({ c: 0.02, h: 30 }, { c: 0.02, h: 30 }));
  assertEquals(sameColumnColor({ c: 0.02, h: 30 }, { c: 0.02, h: 31 }), false);
});
