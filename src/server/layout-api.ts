/**
 * Serves the layout widget API (src/common/apis/layout.ts) from the layout store,
 * on the main server.
 */
import { Effect } from "effect";
import { layoutApi } from "../common/apis/layout.ts";
import type { Layout } from "../common/model.ts";
import { ServerIo } from "./http.ts";
import { layoutText, readLayout, writeLayout } from "./layout-store.ts";
import { HandlerFailed, serve, type ServedApi } from "./widget-api-routes.ts";

/** Whether two layouts are the same, as they'd be saved. */
export const sameLayout = (a: Layout, b: Layout): boolean => layoutText(a) === layoutText(b);

/** The live layout, or (as a result) why it's unreadable. */
const read = readLayout.pipe(
  Effect.map((layout) => ({ ok: true, value: layout }) as const),
  Effect.catchTags({
    CorruptData: (e) =>
      Effect.succeed(
        { ok: false, error: { is: "layout-unreadable", message: e.message } } as const,
      ),
    IoError: (e) => new HandlerFailed({ message: `Couldn't read the layout: ${e.cause}` }),
  }),
);

export const layoutServed: ServedApi<ServerIo> = serve<typeof layoutApi, ServerIo>(layoutApi, {
  get: () => read,
  apply: ({ base, layout }) =>
    Effect.gen(function* () {
      const live = yield* read;
      if (!live.ok) return live;
      if (!sameLayout(live.value, base)) {
        return {
          ok: false,
          error: {
            is: "layout-changed",
            message: "The page changed while this change was being made, so it wasn't applied.",
          },
        } as const;
      }
      yield* writeLayout(layout).pipe(
        Effect.catchTag(
          "IoError",
          (e) => new HandlerFailed({ message: `Couldn't save the layout: ${e.cause}` }),
        ),
      );
      return { ok: true, value: layout } as const;
    }),
});
