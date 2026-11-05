/**
 * The page's Chakra system. The shell and every widget bundle make their own
 * from this, so a widget's Chakra tokens and styles match the shell's.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { rootFontSize } from "./surface.ts";

// Viewport-relative design: every rem (Chakra's included) scales with the window's width.
export const makeSystem = () =>
  createSystem(defaultConfig, defineConfig({ globalCss: { html: { fontSize: rootFontSize } } }));
