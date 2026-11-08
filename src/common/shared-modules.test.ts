import { assertEquals } from "@std/assert";
import {
  bundledSharedPackages,
  importMap,
  packageOf,
  sharedModules,
  sharedPackages,
} from "./shared-modules.ts";

Deno.test("packageOf names a module's package, scoped or not", () => {
  assertEquals(packageOf("react"), "react");
  assertEquals(packageOf("react-dom/client"), "react-dom");
  assertEquals(packageOf("@chakra-ui/react"), "@chakra-ui/react");
  assertEquals(packageOf("@emotion/react/macro"), "@emotion/react");
});

Deno.test("Each shared package is listed once", () => {
  assertEquals(sharedPackages, [
    "react",
    "react-dom",
    "effect",
    "@chakra-ui/react",
    "@emotion/react",
  ]);
});

Deno.test("Shared modules have distinct names and entries", () => {
  assertEquals(new Set(sharedModules.map((m) => m.specifier)).size, sharedModules.length);
  assertEquals(new Set(sharedModules.map((m) => m.entry)).size, sharedModules.length);
});

Deno.test("The import map points each shared name at its module among the assets", () => {
  const { imports } = importMap("/web/assets/");
  assertEquals(imports["react/jsx-runtime"], "/web/assets/shared/react-jsx-runtime.js");
  assertEquals(imports["@chakra-ui/react"], "/web/assets/shared/chakra-ui-react.js");
  assertEquals(Object.keys(imports).length, sharedModules.length);
});

Deno.test("bundledSharedPackages finds the shared packages a bundle carries copies of", () => {
  const deps = "../node_modules/.deno";
  assertEquals(
    bundledSharedPackages([
      "../src/client/widgets/clock/main.tsx",
      `${deps}/react-dom@19.3.1/node_modules/react-dom/server.js`,
      `${deps}/@chakra-ui+react@3.37.0/node_modules/@chakra-ui/react/dist/esm/box.js`,
      `${deps}/react-icons@5.7.0/node_modules/react-icons/lu/index.mjs`,
    ]),
    ["react-dom", "@chakra-ui/react"],
  );
  assertEquals(bundledSharedPackages(["../src/main.tsx"]), []);
});
