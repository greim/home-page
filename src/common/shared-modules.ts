/**
 * The packages the page shares with widgets. The page bundles one copy of each,
 * and every widget bundle imports them by name instead of carrying its own copy.
 * The page's import map points each name at its copy.
 *
 * Each is a module in src/client/shared/, bundled with the page as an entry point
 * of its own, so it's served at `/web/assets/shared/<entry>.js`. Widgets may
 * import only these exact names from these packages: the widget build fails if a
 * widget bundles any other part of them (e.g. `effect/Schema`, `react-dom/server`).
 */

export type SharedModule = {
  /** The name widgets import it by. */
  readonly specifier: string;
  /** Its module in src/client/shared/, without the extension. */
  readonly entry: string;
};

export const sharedModules: ReadonlyArray<SharedModule> = [
  { specifier: "react", entry: "react" },
  { specifier: "react/jsx-runtime", entry: "react-jsx-runtime" },
  { specifier: "react-dom", entry: "react-dom" },
  { specifier: "react-dom/client", entry: "react-dom-client" },
  { specifier: "effect", entry: "effect" },
  { specifier: "@chakra-ui/react", entry: "chakra-ui-react" },
  { specifier: "@emotion/react", entry: "emotion-react" },
];

/** Where the shared modules are, relative to the page's assets (and to src/client/). */
export const sharedDir = "shared";

/** What widget bundles leave out: every shared module's name. */
export const sharedSpecifiers: ReadonlyArray<string> = sharedModules.map((m) => m.specifier);

/** The package a module name belongs to: "react-dom/client" → "react-dom". */
export const packageOf = (specifier: string): string => {
  const parts = specifier.split("/");
  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
};

/** The packages shared, whose code no widget bundle may contain. */
export const sharedPackages: ReadonlyArray<string> = [...new Set(sharedSpecifiers.map(packageOf))];

/** The page's import map: each shared name, to its module among the page's assets. */
export const importMap = (assetsPath: string): { imports: Record<string, string> } => ({
  imports: Object.fromEntries(
    sharedModules.map((m) => [m.specifier, `${assetsPath}${sharedDir}/${m.entry}.js`]),
  ),
});

/**
 * The packages a bundle carries its own copy of, from its source map's `sources`
 * (paths like `../node_modules/.deno/react@19.3.1/node_modules/react/index.js`).
 */
export const bundledSharedPackages = (sources: ReadonlyArray<string>): ReadonlyArray<string> =>
  sharedPackages.filter((pkg) =>
    sources.some((source) => source.includes(`/node_modules/${pkg}/`))
  );

/**
 * esbuild's stand-in for `require()` of a module left out of an ES module bundle:
 * it throws when run. A widget bundle containing it has CommonJS code that
 * requires a shared package, which only works with `import`.
 */
export const dynamicRequireMarker = "Dynamic require of";
