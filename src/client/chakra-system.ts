/**
 * The page's Chakra system. The shell and every widget bundle make their own
 * from this, so a widget's Chakra tokens and styles match the shell's.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { regimeRootFontSizes } from "./regimes.ts";

/**
 * By default, adaptable viewport-relative design: every rem (Chakra's included) scales with
 * the window's width within a layout regime (see regimes.ts). A separate window (the
 * assistant's) passes its own fixed root size instead.
 */
export const makeSystem = (root?: string) =>
  createSystem(
    defaultConfig,
    defineConfig({
      globalCss: { html: root === undefined ? regimeRootFontSizes() : { fontSize: root } },
    }),
  );
