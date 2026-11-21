/** The page's client for the layout history API (see src/common/apis/layout-history.ts). */
import { layoutHistoryApi } from "../common/apis/layout-history.ts";
import { makeApiClient } from "./widget-api-client.ts";

export const layoutHistory = makeApiClient(
  layoutHistoryApi,
  "",
  { widgetType: "page", widgetId: "layout-history" },
  (url, init) => fetch(url, init),
);
