import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { commitMessageServed } from "./commit-message-api.ts";
import { CommitMessageIo } from "./commit-message.ts";
import { handleWidgetApis } from "./widget-api-routes.ts";

const post = (diff: string, answer: ReadonlyArray<unknown>) =>
  Effect.runPromise(
    handleWidgetApis({
      method: "POST",
      url: new URL("https://localhost/api/widget-apis/commit-message/suggest"),
      origin: null,
      body: Effect.succeed(
        JSON.stringify({ caller: { widgetType: "page", widgetId: "p" }, input: { diff } }),
      ),
    }, [commitMessageServed]).pipe(
      Effect.provideService(
        CommitMessageIo,
        CommitMessageIo.of({ ask: () => Effect.succeed(answer) }),
      ),
    ),
  ).then((r) => JSON.parse(String(r.body)));

Deno.test("a suggestion is answered with the message, or its own error", async () => {
  const good = [{ type: "result", subtype: "success", structured_output: { message: "Add news" } }];
  assertEquals(await post("d", good), { ok: true, value: { message: "Add news" } });
  assertEquals(await post("d", []), {
    ok: false,
    error: { is: "no-suggestion", message: "Claude gave no usable description." },
  });
});
