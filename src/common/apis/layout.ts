/**
 * The layout widget API: reading the page's layout, and applying a new one, on the
 * main server. A widget that changes the page for the user (the page configurator)
 * uses it; the page hears about each layout applied through it and shows it at once
 * (see src/client/widget-apis-live.ts). See the `widget-apis` skill.
 *
 * Applying checks the layout's shape, as saving it from the page does. Each widget's
 * config is the widget type's own business: a config that doesn't fit shows an error
 * in that widget's place, as it would if it had been typed into layout.json.
 */
import { Schema } from "effect";
import { Layout } from "../model.ts";
import { apiError, defineApi, operation } from "../widget-apis.ts";

/**
 * The live layout isn't the one the change was made from (the user edited the page
 * meanwhile, say), so the change wasn't applied: make it again, from the live one.
 */
export const LayoutChanged = apiError("layout-changed");

/** The saved layout is invalid, so it can't be read or changed until it's fixed. */
export const LayoutUnreadable = apiError("layout-unreadable");

export const layoutApi = defineApi("layout", "main", {
  /** The live layout. */
  get: operation({
    input: Schema.Struct({}),
    output: Layout,
    errors: LayoutUnreadable,
  }),
  /**
   * Replaces the live layout with `layout`, if the live one is still `base` (the one
   * the change was made from). Answers with the layout as applied.
   */
  apply: operation({
    input: Schema.Struct({ base: Layout, layout: Layout }),
    output: Layout,
    errors: Schema.Union(LayoutChanged, LayoutUnreadable),
    maxBytes: 4_000_000,
  }),
}, { services: [] });

export type LayoutApi = typeof layoutApi;
