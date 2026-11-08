/**
 * Imperative shell for Document Picture-in-Picture: a window of its own that
 * floats above other windows, and that this page renders into. Chrome, Edge and
 * Firefox have it; elsewhere, full-screen views stay modals.
 */

type DocumentPictureInPicture = {
  readonly requestWindow: (options: { width: number; height: number }) => Promise<Window>;
};

const documentPip = (): DocumentPictureInPicture | null =>
  "documentPictureInPicture" in globalThis
    ? (globalThis as unknown as { documentPictureInPicture: DocumentPictureInPicture })
      .documentPictureInPicture
    : null;

/** Whether this browser can open picture-in-picture windows. */
export const pipSupported = (): boolean => documentPip() !== null;

/** Readies a new window's document: full height, no margin, light or dark as the OS is. */
const prepare = (win: Window) => {
  const doc = win.document;
  doc.documentElement.style.height = "100%";
  doc.body.style.height = "100%";
  doc.body.style.margin = "0";
  const dark = win.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => doc.documentElement.classList.toggle("dark", dark.matches);
  apply();
  dark.addEventListener("change", apply);
};

/**
 * Opens a picture-in-picture window about `size` CSS pixels (the browser may adjust
 * it), replacing any this page already has open. Call it from a user's click.
 * `onClosed` is called once the window closes, however it closes.
 */
export const openPipWindow = (
  size: { readonly width: number; readonly height: number },
  onClosed: (win: Window) => void,
): Promise<Window> => {
  const pip = documentPip();
  if (pip === null) return Promise.reject(new Error("Picture-in-picture isn't supported here"));
  return pip.requestWindow({ width: Math.round(size.width), height: Math.round(size.height) })
    .then((win) => {
      prepare(win);
      win.addEventListener("pagehide", () => onClosed(win), { once: true });
      return win;
    });
};
