/** What the page and the assistant MFE say to each other, beyond any widget's. */
import { Schema } from "effect";

/** The assistant sends each layout it applies here, for the page to show. */
export const layoutAppliedChannel = "layout-applied";

/** The admin bar's panel view. */
export const panelViewName = "panel";

export const PanelProps = Schema.Struct({
  onClose: Schema.declare((u: unknown): u is () => void => typeof u === "function"),
});
export type PanelProps = typeof PanelProps.Type;
