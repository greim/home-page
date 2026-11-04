/**
 * Builds every widget in src/client/widgets/ into dist/widgets/: one bundle
 * each, plus registry.json. Exits non-zero, listing every problem, if any
 * widget is broken. The server runs this at startup.
 *
 *   deno task build-widgets
 */
import { Effect } from "effect";
import { config } from "../src/server/config.ts";
import { BundlerIo, BundlerIoLive } from "../tooling/bundle-client.ts";
import { buildWidgets, WidgetBuildIo, WidgetBuildIoLive } from "../tooling/widget-build.ts";

const exitCode = await Effect.runPromise(
  buildWidgets({ sourceDir: config.widgetsSourceDir, outDir: config.widgetsOutDir }).pipe(
    Effect.provideService(WidgetBuildIo, WidgetBuildIoLive),
    Effect.provideService(BundlerIo, BundlerIoLive),
    Effect.match({
      onSuccess: (registry) => {
        console.log(
          `Built ${registry.widgets.length} widget(s): ${
            registry.widgets.map((w) => w.id).join(", ") || "none"
          }`,
        );
        return 0;
      },
      onFailure: (error) => {
        console.error(
          error._tag === "WidgetBuildError"
            ? `The widget build failed:\n- ${error.problems.join("\n- ")}`
            : `The widget build couldn't write its output: ${error.cause}`,
        );
        return 1;
      },
    }),
  ),
);
Deno.exit(exitCode);
