/**
 * Copies a chart to the clipboard in a "Copy as" format (copy.ts), or, for the original
 * data of a chart made from an image, the image. The PNG is drawn
 * from the chart's SVG, put off screen in the page so it's drawn in the page's own
 * font, at its own size (960 × 600).
 */
import { Effect } from "effect";
import { domToBlob } from "modern-screenshot";
import type { Chart, Version } from "./charts.ts";
import { type CopyFormat, originalData, standaloneSpec, standaloneSvg } from "./copy.ts";
import { chartSize } from "./spec.ts";
import { palette } from "./palette.ts";
import { cleanSvg } from "./svg-live.ts";

/** A PNG of the version's full-screen chart, drawn in `doc`. */
const png = async (version: Version, doc: Document): Promise<Blob> => {
  const svg = cleanSvg(version.svg);
  if (svg === null) throw new Error("The chart isn't an SVG.");
  const { width, height } = chartSize;
  const box = doc.createElement("div");
  // In px, not rem: a picture of a set size, not part of the page's layout.
  box.style.cssText = `position: fixed; left: -${width * 2}px; top: 0; width: ${width}px; ` +
    `height: ${height}px; background: ${palette.surface}; color: ${palette.text};`;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  box.append(doc.importNode(svg, true));
  doc.body.append(box);
  return await domToBlob(box, { type: "image/png", scale: 1 }).finally(() => box.remove());
};

/** An image as a PNG, the one image type every clipboard takes. */
const asPng = async (image: Blob): Promise<Blob> => {
  if (image.type === "image/png") return image;
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return await canvas.convertToBlob({ type: "image/png" });
};

/**
 * Copies the chart's `version` as `format`, from the window `from` (a button) is in:
 * a full-screen view may be in a window of its own.
 */
export const copyChart = (
  format: CopyFormat,
  chart: Chart,
  version: Version,
  from: Element,
): Effect.Effect<void, string> =>
  Effect.tryPromise({
    try: () => {
      const doc = from.ownerDocument;
      const clipboard = (doc.defaultView ?? window).navigator.clipboard;
      switch (format) {
        case "png":
          // The blob is given as a promise, so the copy keeps the click's permission.
          return clipboard.write([new ClipboardItem({ "image/png": png(version, doc) })]);
        case "svg":
          return clipboard.writeText(standaloneSvg(version.svg));
        case "vega-lite":
          return clipboard.writeText(standaloneSpec(chart, version));
        case "data":
          // A chart made from an image copies the image.
          return chart.image === null
            ? clipboard.writeText(originalData(chart))
            : clipboard.write([new ClipboardItem({ "image/png": asPng(chart.image) })]);
        default:
          return format satisfies never;
      }
    },
    catch: String,
  });
