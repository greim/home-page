/** Browser entry point. */
import { ChakraProvider, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { rootFontSize } from "./surface.ts";

// Viewport-relative design: every rem (Chakra's included) scales with the window's width.
const system = createSystem(
  defaultConfig,
  defineConfig({ globalCss: { html: { fontSize: rootFontSize } } }),
);

// Follow the OS light/dark setting (Chakra keys dark tokens off this class).
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyScheme();
dark.addEventListener("change", applyScheme);

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </StrictMode>,
);
