/**
 * The page's Chakra system. The shell and every widget bundle make their own
 * from this, so a widget's Chakra tokens and styles match the shell's.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { rootFontSize } from "./surface.ts";

/**
 * By default, viewport-relative design: every rem (Chakra's included) scales with the
 * window's width. A separate window (the assistant's) passes its own root size instead.
 */
export const makeSystem = (root: string = rootFontSize) =>
  createSystem(defaultConfig, defineConfig({ globalCss: { html: { fontSize: root } } }));
