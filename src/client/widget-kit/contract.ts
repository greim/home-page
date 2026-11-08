/**
 * What the shell passes a widget's views, and what they pass back. Props cross
 * between bundles as they are, functions included.
 */
import type { Schedule } from "../../common/day-cycle.ts";

/**
 * A CSS variable every column sets to its current background color: its own
 * color by day, the night gray at night, fading between them with the column.
 * Widgets inherit it, for tinting things to match the column they're in, e.g.
 * `oklch(from var(--column-background) calc(l + 0.1) c h)`.
 */
export const columnBackgroundVar = "--column-background";

/** The view shown in a column. */
export const widgetViewName = "widget";
/** The settings form shown in the column editor. */
export const editorViewName = "editor";

export type WidgetViewProps = {
  readonly widgetId: string;
  /** The widget's config as saved: JSON, for the widget to decode. */
  readonly config: unknown;
  /** Saves a changed config, e.g. a bookmark folder opened. */
  readonly saveConfig: (config: unknown) => void;
  /** When the user's day starts and ends, and their weekend (see day-cycle.ts). */
  readonly schedule: Schedule;
};

/** An editor's verdict on its current draft. */
export type DraftReport =
  | { readonly ok: true; readonly config: unknown }
  | { readonly ok: false; readonly errorMessage: string };

export type EditorViewProps = {
  readonly widgetId: string;
  /** The config to start editing from. Later changes to it are ignored. */
  readonly config: unknown;
  /** Called with the draft when the editor opens, and after each change. */
  readonly reportDraft: (report: DraftReport) => void;
};
