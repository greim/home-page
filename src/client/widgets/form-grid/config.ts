/** The form grid widget's config: search fields, each opening a URL made from what's typed. */
import { Schema } from "effect";
import type { Draft } from "../../widget-kit/decode.ts";
import { placeholder } from "./url-template.ts";

export const FormField = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** A URL containing `{query}`, which is replaced by the field's value. */
  urlTemplate: Schema.String,
});
export type FormField = typeof FormField.Type;

export const GridColumns = Schema.Literal(1, 2, 3, 4);
export type GridColumns = typeof GridColumns.Type;

export const FormGridConfig = Schema.Struct({
  gridColumns: GridColumns,
  fields: Schema.Array(FormField),
});
export type FormGridConfig = typeof FormGridConfig.Type;

/** A config is ready to save once every field's URL template has the placeholder. */
export const checkConfig = (config: FormGridConfig): Draft<FormGridConfig> => {
  const bad = config.fields.find((f) => !f.urlTemplate.includes(placeholder));
  return bad === undefined ? { ok: true, config } : {
    ok: false,
    errorMessage: `"${bad.label || "Untitled"}": URL template must contain ${placeholder}`,
  };
};
