/**
 * Column colors. Every column shares one OKLCH lightness, and the user chooses
 * only chroma (c) and hue (h): OKLCH is perceptually uniform, so columns of any
 * hue look equally light, keep white text equally legible, and desaturate
 * evenly toward the same gray.
 */
import { Schema } from "effect";

/** The OKLCH lightness of every column. */
export const columnLightness = 0.63553;

/**
 * Comfortably above the most chroma any hue reaches in sRGB at the column
 * lightness. The picker keeps to what each hue can actually show (maxChroma).
 */
export const chromaLimit = 0.4;

/** A column's color: OKLCH chroma and hue (in degrees) at the column lightness. */
export const ColumnColor = Schema.Struct({
  c: Schema.Number.pipe(Schema.between(0, chromaLimit)),
  h: Schema.Number.pipe(Schema.greaterThanOrEqualTo(0), Schema.lessThan(360)),
});
export type ColumnColor = typeof ColumnColor.Type;

/** The colors offered as quick picks: muted, at evenly spaced hues. */
export const columnColorPresets: ReadonlyArray<ColumnColor> = [
  { c: 0.0185455, h: 104.283 },
  { c: 0.0110218, h: 222.288 },
  { c: 0.0238316, h: 322.557 },
  { c: 0.0252648, h: 23.606 },
];

export const defaultColumnColor: ColumnColor = { c: 0.0185455, h: 104.283 };

/** The CSS color, e.g. `oklch(0.63553 0.0185455 104.283)`. */
export const columnColorCss = (color: ColumnColor): string =>
  `oklch(${columnLightness} ${color.c} ${color.h})`;

type Lch = { readonly l: number; readonly c: number; readonly h: number };
type Rgb = readonly [number, number, number];

/** OKLCH to linear-light sRGB (Björn Ottosson's OKLab matrices). */
const toLinearRgb = ({ l, c, h }: Lch): Rgb => {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
};

/** Linear-light sRGB to OKLCH, with the hue in [0, 360). */
const fromLinearRgb = ([r, g, b]: Rgb): Lch => {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, bb), h: (h + 360) % 360 };
};

const tolerance = 1e-6;
const inGamut = (rgb: Rgb): boolean => rgb.every((v) => v >= -tolerance && v <= 1 + tolerance);

const toLinear = (v: number): number => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toGamma = (v: number): number => {
  const clipped = Math.min(1, Math.max(0, v));
  return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
};

/** Drops floating-point noise, keeping what the eye could tell apart and then some. */
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * The most chroma hue `h` reaches in sRGB at the column lightness, so the
 * picker never offers a color the screen can't show. Rounded down.
 */
export const maxChroma = (h: number): number => {
  let lo = 0;
  let hi = chromaLimit;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(toLinearRgb({ l: columnLightness, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 10000) / 10000;
};

/** Changes the hue, lowering the chroma if the new hue can't reach it. */
export const withHue = (color: ColumnColor, h: number): ColumnColor => {
  const hue = ((h % 360) + 360) % 360;
  return { h: hue, c: Math.min(color.c, maxChroma(hue)) };
};

/** Changes the chroma, kept between none and the most the hue reaches. */
export const withChroma = (color: ColumnColor, c: number): ColumnColor => ({
  h: color.h,
  c: Math.min(Math.max(0, c), maxChroma(color.h)),
});

/**
 * The column color closest to a `#rrggbb` color: its chroma and hue at the
 * column lightness, with the chroma lowered if needed to stay in sRGB. Grays
 * get hue 0.
 */
export const fromHex = (hex: string): ColumnColor => {
  const channel = (offset: number) => toLinear(parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const { c, h } = fromLinearRgb([channel(1), channel(3), channel(5)]);
  const hue = c < 1e-4 ? 0 : round(h, 3) % 360;
  return { h: hue, c: round(Math.min(c, maxChroma(hue)), 7) };
};

/** The `#rrggbb` color nearest a column color. */
export const toHex = (color: ColumnColor): string =>
  "#" +
  toLinearRgb({ l: columnLightness, ...color })
    .map((v) => Math.round(toGamma(v) * 255).toString(16).padStart(2, "0"))
    .join("");

/** A color saved as `#rrggbb`, from before columns used OKLCH. */
const HexColor = Schema.String.pipe(Schema.pattern(/^#[0-9a-fA-F]{6}$/));

/**
 * A column color as saved: `{ c, h }`, or a `#rrggbb` color from before, which
 * keeps its chroma and hue (see fromHex). Always saved as `{ c, h }`.
 */
export const StoredColumnColor = Schema.Union(
  ColumnColor,
  Schema.transform(HexColor, ColumnColor, { strict: true, decode: fromHex, encode: toHex }),
);

/** Chroma shown along the hue slider's track, so every hue is visible but none clips. */
const hueTrackChroma = 0.08;

/** A CSS gradient through every hue at the column lightness, for a hue slider's track. */
export const hueGradient = (): string => {
  const stops = Array.from({ length: 13 }, (_, i) => i * 30).map((h) =>
    columnColorCss({ c: Math.min(hueTrackChroma, maxChroma(h)), h })
  );
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

/** A CSS gradient from gray to the most chroma hue `h` reaches, for a chroma slider's track. */
export const chromaGradient = (h: number): string =>
  `linear-gradient(to right, ${columnColorCss({ c: 0, h })}, ${
    columnColorCss({ c: maxChroma(h), h })
  })`;

export const sameColumnColor = (a: ColumnColor, b: ColumnColor): boolean =>
  a.c === b.c && a.h === b.h;
