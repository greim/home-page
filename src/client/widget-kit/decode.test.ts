import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import { defaultSchedule } from "../../common/day-cycle.ts";
import { decodeEditorProps, decodeFullScreenProps, decodeWidgetProps } from "./decode.ts";

/** A config whose saved form differs from its decoded one, to check both directions. */
const Config = Schema.Struct({ count: Schema.NumberFromString });

const failure = <A>(result: Either.Either<A, string>) =>
  Either.isLeft(result) ? result.left : "decoded";

Deno.test("decodeWidgetProps decodes the config, and encodes it again to save", () => {
  const saved: Array<unknown> = [];
  let opened = 0;
  const props = decodeWidgetProps(Config, {
    widgetId: "w",
    config: { count: "2" },
    saveConfig: (c: unknown) => saved.push(c),
    schedule: defaultSchedule,
    openFullScreen: () => opened++,
  });
  assertEquals(
    Either.map(props, (p) => [p.widgetId, p.config, p.schedule]),
    Either.right(["w", { count: 2 }, defaultSchedule]),
  );
  Either.map(props, (p) => {
    p.saveConfig({ count: 3 });
    p.openFullScreen();
  });
  assertEquals(saved, [{ count: "3" }]);
  assertEquals(opened, 1);
});

Deno.test("decodeFullScreenProps decodes the same props, without a way to open itself", () => {
  const saved: Array<unknown> = [];
  const props = decodeFullScreenProps(Config, {
    widgetId: "w",
    config: { count: "2" },
    saveConfig: (c: unknown) => saved.push(c),
    schedule: defaultSchedule,
  });
  assertEquals(
    Either.map(props, (p) => [p.config, "openFullScreen" in p]),
    Either.right([{ count: 2 }, false]),
  );
  Either.map(props, (p) => p.saveConfig({ count: 4 }));
  assertEquals(saved, [{ count: "4" }]);
});

Deno.test("decodeWidgetProps says what's wrong with the config", () => {
  const props = {
    widgetId: "w",
    config: { count: "lots" },
    saveConfig: () => {},
    schedule: defaultSchedule,
    openFullScreen: () => {},
  };
  assertStringIncludes(failure(decodeWidgetProps(Config, props)), "settings are invalid");
});

Deno.test("decodeWidgetProps rejects props from something that isn't the shell", () => {
  assertStringIncludes(
    failure(decodeWidgetProps(Config, { widgetId: "w", config: {}, schedule: defaultSchedule })),
    "saveConfig",
  );
  assertStringIncludes(
    failure(decodeWidgetProps(Config, { widgetId: "w", config: {}, saveConfig: () => {} })),
    "schedule",
  );
});

Deno.test("decodeEditorProps reports drafts with their config encoded", () => {
  const reports: Array<unknown> = [];
  const props = decodeEditorProps(Config, {
    widgetId: "w",
    config: { count: "1" },
    reportDraft: (r: unknown) => reports.push(r),
  });
  Either.map(props, (p) => {
    p.reportDraft({ ok: true, config: { count: 5 } });
    p.reportDraft({ ok: false, errorMessage: "bad" });
  });
  assertEquals(reports, [{ ok: true, config: { count: "5" } }, { ok: false, errorMessage: "bad" }]);
});

Deno.test("decodeEditorProps says what's wrong with the config", () => {
  const props = { widgetId: "w", config: null, reportDraft: () => {} };
  assertStringIncludes(failure(decodeEditorProps(Config, props)), "settings are invalid");
});
