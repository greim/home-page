import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { LayoutRepo, makeLayoutHistory } from "./layout-history.ts";
import { layoutRepoIn } from "./layout-history-live.ts";

/** Real git, in a temporary folder that isn't inside any repo of ours. */
Deno.test("the layout history works against real git: start, change, accept, restore, discard", async () => {
  const dir = await Deno.makeTempDir({ prefix: "layout-history-" });
  const data = `${dir}/data`; // not made yet: starting the repo makes it
  try {
    const layoutPath = `${data}/layout.json`;
    const program = Effect.gen(function* () {
      const history = yield* makeLayoutHistory;
      yield* history.available;
      assertEquals(yield* history.status, "clean");
      yield* Effect.promise(() => Deno.writeTextFile(layoutPath, '{"n":1}\n'));
      assertEquals(yield* history.status, "new");
      assertEquals(yield* history.accept("First layout"), true);
      yield* Effect.promise(() => Deno.writeTextFile(layoutPath, '{"n":2}\n'));
      assertEquals(yield* history.status, "modified");
      assertEquals(yield* history.accept("Second layout"), true);
      assertEquals((yield* history.versions(10)).map((v) => v.message), [
        "Second layout",
        "First layout",
      ]);
      const first = (yield* history.versions(10)).at(1);
      yield* history.restore(first?.id ?? "");
      assertEquals(yield* Effect.promise(() => Deno.readTextFile(layoutPath)), '{"n":1}\n');
      assertEquals(yield* history.status, "modified");
      assertEquals(yield* history.discard, true);
      assertEquals(yield* Effect.promise(() => Deno.readTextFile(layoutPath)), '{"n":2}\n');
      assertEquals(yield* history.status, "clean");
    });
    await Effect.runPromise(program.pipe(Effect.provideService(LayoutRepo, layoutRepoIn(data))));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
