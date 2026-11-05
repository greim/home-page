/** Pure editing logic behind a widget's pane in the column editor. */
import type { Widget } from "../common/model.ts";
import type { DraftReport } from "./widget-kit/contract.ts";

/**
 * A widget being edited, and its editor's latest report on its config: null
 * until its editor has opened, which leaves the config as it was.
 */
export type Draft = { readonly widget: Widget; readonly report: DraftReport | null };

export const toDraft = (widget: Widget): Draft => ({ widget, report: null });

export const withReport = (draft: Draft, report: DraftReport): Draft => ({ ...draft, report });

/** The config to (re)start the editor from: the latest valid one. */
export const draftConfig = (draft: Draft): unknown =>
  draft.report?.ok ? draft.report.config : draft.widget.config;

export type Finished =
  | { ok: true; widget: Widget }
  | { ok: false; errorMessage: string };

export const finishDraft = (draft: Draft): Finished => {
  const { widget, report } = draft;
  if (report === null) {
    return { ok: true, widget };
  }
  return report.ok ? { ok: true, widget: { ...widget, config: report.config } } : report;
};
