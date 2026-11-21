/**
 * Where the visualizer keeps its charts: in this browser's IndexedDB (dumps can be
 * megabytes, too big for localStorage), and in memory, shared by the widget's card
 * and its full-screen view (both run in this bundle). Also which chart each card shows
 * (in localStorage, so a cleared card stays clear), and, in memory only, which charts
 * an agent is working on.
 *
 * If the browser won't keep them, charts last until the page reloads.
 */
import { useSyncExternalStore } from "react";
import type { Chart } from "./charts.ts";

const dbName = "visualizer";
const storeName = "charts";

/** Every widget's charts, once loaded. */
let charts: ReadonlyArray<Chart> = [];
let loaded = false;
/** Per widget: the chart its card shows, or null for an empty box. */
const shown = new Map<string, string | null>();

const shownKey = (widgetId: string) => `visualizer:${widgetId}:card`;

/** A widget's card's chart: as chosen this session, or as kept; undefined if never chosen. */
const shownIn = (widgetId: string): string | null | undefined => {
  if (!shown.has(widgetId)) {
    // Kept as the chart's ID, or "" for an empty box.
    const kept = readKept(shownKey(widgetId));
    if (kept !== null) shown.set(widgetId, kept === "" ? null : kept);
  }
  return shown.has(widgetId) ? shown.get(widgetId) : undefined;
};

const setShown = (widgetId: string, chartId: string | null): void => {
  shown.set(widgetId, chartId);
  keep(shownKey(widgetId), chartId ?? "");
};

/** localStorage, which may be unavailable or full: then the choice lasts the session. */
const readKept = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not kept: it lasts until the page reloads.
  }
};
/** The charts an agent is working on, and what it last said it was doing. */
let working: ReadonlyMap<string, string> = new Map();

const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const request = <A>(r: IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

let db: Promise<IDBDatabase | null> | null = null;
const openDb = (): Promise<IDBDatabase | null> => {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(storeName, { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  }).catch(() => null);
  return db;
};

const write = async (f: (store: IDBObjectStore) => IDBRequest): Promise<void> => {
  const opened = await openDb();
  if (opened === null) return;
  await request(f(opened.transaction(storeName, "readwrite").objectStore(storeName)))
    .catch(() => undefined);
};

/** A version's full-screen SVG, from when each was drawn at two sizes. */
const oldFullSvg = (version: object): string =>
  "fullSvg" in version && typeof version.fullSvg === "string" ? version.fullSvg : "";

const load = async () => {
  if (loaded) return;
  loaded = true;
  const opened = await openDb();
  if (opened === null) return;
  const stored = await request(
    opened.transaction(storeName).objectStore(storeName).getAll() as IDBRequest<Array<Chart>>,
  ).catch(() => []);
  const known = new Set(charts.map((c) => c.id));
  // Charts kept before `original` and `image` were have neither.
  const fresh = stored.filter((c) => !known.has(c.id)).map((c) => ({
    ...c,
    original: c.original ?? "",
    image: c.image ?? null,
    // Charts kept when each version was drawn twice: the full-screen drawing.
    versions: c.versions.map((v) => ({ spec: v.spec, svg: v.svg ?? oldFullSvg(v) })),
  }));
  charts = [...charts, ...fresh];
  changed();
};

/** Adds a chart, or replaces the one with its ID. */
export const putChart = (chart: Chart): void => {
  charts = charts.some((c) => c.id === chart.id)
    ? charts.map((c) => c.id === chart.id ? chart : c)
    : [...charts, chart];
  changed();
  void write((store) => store.put(chart));
};

/** Changes the chart with `id`, if it's still there. */
export const updateChart = (id: string, f: (chart: Chart) => Chart): void => {
  const chart = charts.find((c) => c.id === id);
  if (chart !== undefined) putChart(f(chart));
};

export const deleteChart = (id: string): void => {
  charts = charts.filter((c) => c.id !== id);
  for (const [widgetId, chartId] of shown) if (chartId === id) setShown(widgetId, null);
  changed();
  void write((store) => store.delete(id));
};

/** Shows a chart in a widget's card (null for the empty box). */
export const showInCard = (widgetId: string, chartId: string | null): void => {
  setShown(widgetId, chartId);
  changed();
};

/** Notes that an agent is working on a chart (with what it's doing), or has stopped (null). */
export const setWorking = (chartId: string, progress: string | null): void => {
  const next = new Map(working);
  if (progress === null) next.delete(chartId);
  else next.set(chartId, progress);
  working = next;
  changed();
};

const empty: ReadonlyArray<Chart> = [];
const byWidget = new Map<string, { from: ReadonlyArray<Chart>; list: ReadonlyArray<Chart> }>();

/** A widget's charts, newest first. */
export const useCharts = (widgetId: string): ReadonlyArray<Chart> => {
  void load();
  return useSyncExternalStore(subscribe, () => {
    const cached = byWidget.get(widgetId);
    if (cached?.from === charts) return cached.list;
    const list = charts.filter((c) => c.widgetId === widgetId)
      .sort((a, b) => b.createdAt - a.createdAt);
    byWidget.set(widgetId, { from: charts, list: list.length === 0 ? empty : list });
    return list.length === 0 ? empty : list;
  });
};

/**
 * The ID of the chart a widget's card shows: null for the empty box, undefined if the
 * user hasn't chosen (the card shows the latest chart).
 */
export const useShownInCard = (widgetId: string): string | null | undefined =>
  useSyncExternalStore(subscribe, () => shownIn(widgetId));

/** The charts an agent is working on, with what it's doing. */
export const useWorking = (): ReadonlyMap<string, string> =>
  useSyncExternalStore(subscribe, () => working);
