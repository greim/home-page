/**
 * The assistant's own window: a Document Picture-in-Picture window that floats
 * above other windows, rendered by this page's React tree through a portal (so
 * there's no state to sync). Where the browser has no Document PiP, a panel
 * docked to the side of the page instead, sized like the rest of the page.
 */
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  Box,
  Button,
  ChakraProvider,
  CloseButton,
  EnvironmentProvider,
  HStack,
} from "@chakra-ui/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuBotMessageSquare } from "react-icons/lu";
import { createPortal } from "react-dom";
import { makeSystem } from "../chakra-system.ts";
import { screenshotSkip } from "../screenshot.ts";

/** The window's own rem: the browser's default, since the window reflows rather than scales. */
const windowSystem = makeSystem("16px");

/** The size the window asks for when it opens; the user can resize it. */
const preferredSize = { width: 480, height: 720 };

type DocumentPictureInPicture = {
  readonly requestWindow: (options: { width: number; height: number }) => Promise<Window>;
};

const documentPip = (): DocumentPictureInPicture | null =>
  "documentPictureInPicture" in globalThis
    ? (globalThis as unknown as { documentPictureInPicture: DocumentPictureInPicture })
      .documentPictureInPicture
    : null;

export type WindowState =
  | { is: "closed" }
  | { is: "pip"; win: Window }
  | { is: "panel" };

/** Readies a new PiP window's document for the app's UI: title, full height, light or dark. */
const prepare = (win: Window) => {
  const doc = win.document;
  doc.title = "Assistant";
  doc.documentElement.style.height = "100%";
  doc.body.style.height = "100%";
  doc.body.style.margin = "0";
  const dark = win.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => doc.documentElement.classList.toggle("dark", dark.matches);
  apply();
  dark.addEventListener("change", apply);
};

/** Set while the page unloads with the window open (e.g. reloading), to offer it again after. */
const reopenKey = "home-page.assistant-window.reopen";

/** Whether the window was open when the page last unloaded, in this tab; asks only once. */
const wasOpen = (): boolean => {
  try {
    const open = sessionStorage.getItem(reopenKey) === "1";
    sessionStorage.removeItem(reopenKey);
    return open;
  } catch {
    return false;
  }
};

/**
 * The window's state, with ways to open it (from a click: a PiP window needs the
 * user's gesture) and close it. A reload closes the window, so afterwards `reopen`
 * offers it again (or, as a panel, which needs no gesture, it simply reopens).
 */
export const useAssistantWindow = () => {
  const [openBefore] = useState(wasOpen);
  const [reopen, setReopen] = useState(openBefore && documentPip() !== null);
  const [state, setState] = useState<WindowState>(
    openBefore && documentPip() === null ? { is: "panel" } : { is: "closed" },
  );
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const remember = () => {
      if (current.current.is === "closed") return;
      try {
        sessionStorage.setItem(reopenKey, "1");
      } catch {
        // Not offered after the reload; it can still be opened from the admin bar.
      }
    };
    globalThis.addEventListener("pagehide", remember);
    return () => globalThis.removeEventListener("pagehide", remember);
  }, []);
  const open = useCallback(() => {
    setReopen(false);
    // Already open: a second PiP window would replace this one, so leave it be.
    if (current.current.is !== "closed") return;
    const pip = documentPip();
    if (pip === null) {
      setState({ is: "panel" });
      return;
    }
    pip.requestWindow(preferredSize).then(
      (win) => {
        prepare(win);
        // Fires however it closes: by the user, by close(), or with this page.
        win.addEventListener(
          "pagehide",
          () => setState((s) => s.is === "pip" && s.win === win ? { is: "closed" } : s),
          { once: true },
        );
        setState({ is: "pip", win });
      },
      (error) => {
        console.warn("Couldn't open the assistant's window, so it's a panel instead:", error);
        setState({ is: "panel" });
      },
    );
  }, []);
  const close = useCallback(() => {
    setState((s) => {
      if (s.is === "pip") s.win.close();
      return { is: "closed" };
    });
  }, []);
  return { state, open, close, reopen, dismissReopen: useCallback(() => setReopen(false), []) };
};

/** After a reload closed the assistant's window: a button to open it again. */
export function ReopenAssistant(props: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <HStack
      {...{ [screenshotSkip]: "" }}
      position="fixed"
      bottom="4"
      right="4"
      zIndex="4"
      gap="1"
      bg="bg"
      color="fg"
      boxShadow="lg"
      rounded="l3"
      p="1"
    >
      <Button size="sm" variant="ghost" onClick={props.onOpen}>
        <LuBotMessageSquare /> Reopen the assistant
      </Button>
      <CloseButton size="sm" aria-label="Don't reopen it" onClick={props.onDismiss} />
    </HStack>
  );
}

/** Renders into a PiP window: its own style sheet target, overlays, and 16px rem. */
function PipPortal(props: { win: Window; children: ReactNode }) {
  const { win } = props;
  const cache = useMemo(() => createCache({ key: "pip", container: win.document.head }), [win]);
  return createPortal(
    <CacheProvider value={cache}>
      <EnvironmentProvider value={() => win.document}>
        <ChakraProvider value={windowSystem}>{props.children}</ChakraProvider>
      </EnvironmentProvider>
    </CacheProvider>,
    win.document.body,
  );
}

/** The assistant's UI, in whichever window it's open in. */
export function AssistantWindow(props: { state: WindowState; children: ReactNode }) {
  const { state } = props;
  switch (state.is) {
    case "closed":
      return null;
    case "pip":
      return <PipPortal win={state.win}>{props.children}</PipPortal>;
    case "panel":
      return (
        <Box
          {
            // The agent sees the page itself, not its own chat.
            ...{ [screenshotSkip]: "" }
          }
          position="fixed"
          top="0"
          right="0"
          bottom="0"
          w="min(28rem, 100vw)"
          zIndex="4"
          bg="bg"
          boxShadow="lg"
        >
          {props.children}
        </Box>
      );
    default:
      return state satisfies never;
  }
}
