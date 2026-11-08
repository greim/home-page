// @ts-nocheck: lists what the package exports at runtime, including internals its types leave out.
/**
 * One of the packages the page shares with widgets (see src/common/shared-modules.ts).
 * It's CommonJS, so its exports are listed: `export *` would leave the bundled module
 * with none. A test checks the list against the package.
 */
export { createRoot, default, hydrateRoot, version } from "react-dom/client";
