/**
 * Checks a layout file: its shape, and each widget's config against its type's
 * manifest in src/client/widgets/. Prints every problem and exits non-zero if
 * there are any. The assistant's server runs this, in its own process so it
 * always loads the current manifests, when the agent's turn ends.
 *
 *   deno run --allow-read --allow-env bin/check-layout.ts data/layout.json
 */
import { Effect, Either } from "effect";
import { config } from "../src/server/config.ts";
import { decodeLayoutJson } from "../src/server/layout-store.ts";
import { configProblems, loadTypes, typesUsed } from "../tooling/layout-check.ts";
import { WidgetBuildIo, WidgetBuildIoLive } from "../tooling/widget-build.ts";

const check = (path: string) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => Deno.readTextFile(path),
      catch: (cause) => `Couldn't read ${path}: ${cause}`,
    });
    const layout = decodeLayoutJson(text);
    if (Either.isLeft(layout)) {
      return [layout.left];
    }
    const types = yield* loadTypes(config.widgetsSourceDir, typesUsed(layout.right));
    return configProblems(layout.right, types);
  }).pipe(
    Effect.catchAll((problem) => Effect.succeed([problem])),
    Effect.provideService(WidgetBuildIo, WidgetBuildIoLive),
  );

const path = Deno.args.at(0);
if (path === undefined) {
  console.error("Usage: bin/check-layout.ts <layout.json>");
  Deno.exit(2);
}
const problems = await Effect.runPromise(check(path));
if (problems.length > 0) {
  console.error(`The layout has problems:\n- ${problems.join("\n- ")}`);
  Deno.exit(1);
}
console.log("The layout is valid.");
