import { assertEquals } from "@std/assert";
import { includeInScreenshot, maxScreenshotWidth, screenshotScale } from "./screenshot.ts";

Deno.test("screenshotScale keeps narrow pages at their own size", () => {
  assertEquals(screenshotScale(1200), 1);
  assertEquals(screenshotScale(maxScreenshotWidth), 1);
});

Deno.test("screenshotScale shrinks wide pages to the widest worth sending", () => {
  assertEquals(screenshotScale(maxScreenshotWidth * 2), 0.5);
});

const element = (attributes: ReadonlyArray<string>) =>
  ({ nodeType: 1, hasAttribute: (name: string) => attributes.includes(name) }) as unknown as Node;

Deno.test("includeInScreenshot leaves out elements marked to skip, and keeps everything else", () => {
  assertEquals(includeInScreenshot(element(["data-screenshot-skip"])), false);
  assertEquals(includeInScreenshot(element(["class"])), true);
  // A text node has no attributes to check.
  assertEquals(includeInScreenshot({ nodeType: 3 } as unknown as Node), true);
});
