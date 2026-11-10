/**
 * The page hears about each layout a widget applies through the layout widget API
 * (src/common/apis/layout.ts), so it shows it at once and its own saves carry on
 * from it, rather than writing back the layout it had before.
 */
import { type LayoutApi, layoutApi } from "../common/apis/layout.ts";
import type { Layout } from "../common/model.ts";
import type { ApiClient } from "../common/widget-apis.ts";
import type { WidgetApis } from "./widget-kit/contract.ts";

/** `apis`, with the layout API's `apply` (if there is one) telling `onApplied` what it applied. */
export const hearAppliedLayouts = (
  apis: WidgetApis,
  onApplied: (layout: Layout) => void,
): WidgetApis => {
  const client = apis[layoutApi.name] as ApiClient<LayoutApi> | undefined;
  if (client === undefined) return apis;
  const heard: ApiClient<LayoutApi> = {
    ...client,
    apply: async (input, options) => {
      const result = await client.apply(input, options);
      if (result.ok) onApplied(result.value);
      return result;
    },
  };
  return { ...apis, [layoutApi.name]: heard };
};
