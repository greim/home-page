/**
 * A column text box's height, remembered across reloads: the user can drag the box taller or
 * shorter, and the height is kept per widget in this browser's localStorage, in rem so it holds as
 * the page scales. If the browser won't keep it, the box starts at its default again.
 */
import { useCallback, useState } from "react";

/** The height every column text box starts at. */
export const defaultBoxHeight = "5rem";

const key = (widgetId: string) => `box-height:${widgetId}`;

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

const readHeight = (widgetId: string): string => {
  try {
    const text = localStorage.getItem(key(widgetId));
    return text !== null && /^\d+(\.\d+)?rem$/.test(text) ? text : defaultBoxHeight;
  } catch {
    return defaultBoxHeight;
  }
};

/**
 * The height to give a box (as its `h`), and a `ref` to put on it, which keeps whatever height the
 * user drags it to.
 */
export const useBoxHeight = (widgetId: string) => {
  const [height] = useState(() => readHeight(widgetId));
  const ref = useCallback((el: HTMLElement | null) => {
    if (el === null) return;
    let last = el.offsetHeight;
    const observer = new ResizeObserver(() => {
      const now = el.offsetHeight;
      // Not shown (0), or no real change: nothing the user did.
      if (now === 0 || Math.abs(now - last) < 1) return;
      last = now;
      try {
        localStorage.setItem(key(widgetId), `${now / remPx()}rem`);
      } catch {
        // Not kept: it lasts until the page reloads.
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [widgetId]);
  return { h: height, ref };
};
