import { assertEquals } from "@std/assert";
import type { Widget } from "../common/model.ts";
import { draftConfig, finishDraft, toDraft, withReport } from "./widget-draft.ts";

const widget: Widget = {
  id: "w",
  is: "clock",
  subheading: "Clock",
  collapsed: false,
  config: { timeZone: null },
};

Deno.test("a draft whose editor never opened finishes unchanged", () => {
  assertEquals(finishDraft(toDraft(widget)), { ok: true, widget });
  assertEquals(draftConfig(toDraft(widget)), widget.config);
});

Deno.test("a draft finishes with its editor's latest config", () => {
  const draft = withReport(toDraft(widget), { ok: true, config: { timeZone: "UTC" } });
  assertEquals(finishDraft(draft), {
    ok: true,
    widget: { ...widget, config: { timeZone: "UTC" } },
  });
  assertEquals(draftConfig(draft), { timeZone: "UTC" });
});

Deno.test("a draft its editor reports invalid doesn't finish", () => {
  const draft = withReport(toDraft(widget), { ok: false, errorMessage: "Bad zone" });
  assertEquals(finishDraft(draft), { ok: false, errorMessage: "Bad zone" });
  assertEquals(draftConfig(draft), widget.config);
});
