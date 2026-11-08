/**
 * Shows full-screen views (see full-screen.ts): the one in the modal, over the page,
 * and the one in the picture-in-picture (PiP) window, if any.
 *
 * Each view renders into a container element of its own, which is moved, not
 * re-rendered, between the modal and the PiP window. So tearing a view off, or
 * pulling it back, keeps its state (a draft, a half-typed message); it's only
 * restyled for the document it's now in.
 */
import { CloseButton, Dialog, Flex, HStack, IconButton, Portal, Text } from "@chakra-ui/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LuPictureInPicture2, LuSquareArrowDownLeft } from "react-icons/lu";
import type { Layout } from "../../common/model.ts";
import { DocumentStyles } from "../document-styles.tsx";
import { MfeDocument } from "../mfe/mfe-view.tsx";
import {
  canPullBack,
  close,
  closed,
  closeModal,
  type FullScreenState,
  type FullScreenView,
  open,
  pipClosed,
  prune,
  pullBack,
  tornOff,
  viewKey,
} from "./full-screen.ts";
import { openPipWindow, pipSupported } from "./pip-window.ts";

export type { FullScreenView } from "./full-screen.ts";

/** What a view shows, and how big its modal is. */
export type ViewContent = {
  readonly title: string;
  /** The modal's width: a CSS length, or "full" for the whole screen. */
  readonly width: string;
  /** Whether the modal fills the screen's height, or fits its content. */
  readonly fullHeight: boolean;
  readonly content: ReactNode;
};

export type FullScreen = {
  readonly state: FullScreenState<Window>;
  /** Opens a view as a modal (pulling it back from the PiP window if it's there). */
  readonly open: (view: FullScreenView) => void;
  /** Closes a view wherever it is. */
  readonly close: (view: FullScreenView) => void;
  readonly closeModal: () => void;
  /** Moves the modal's view to a new PiP window about `size` CSS pixels. */
  readonly tearOff: (size: { width: number; height: number }) => void;
  readonly pullBack: () => void;
};

/** The full-screen views' state, kept to what `layout` still has. */
export const useFullScreen = (layout: Layout | null): FullScreen => {
  const [state, setState] = useState<FullScreenState<Window>>(closed);

  useEffect(() => {
    if (layout !== null) setState((s) => prune(s, layout));
  }, [layout]);

  // A PiP window closes once it no longer holds a view (pulled back, closed or pruned).
  const pipWindow = state.pip?.window ?? null;
  useEffect(() => () => {
    if (pipWindow !== null && !pipWindow.closed) pipWindow.close();
  }, [pipWindow]);

  const tearOff = useCallback((size: { width: number; height: number }) => {
    openPipWindow(size, (win) => setState((s) => pipClosed(s, win))).then(
      (win) => setState((s) => tornOff(s, win)),
      (error) => console.warn("Couldn't open a picture-in-picture window:", error),
    );
  }, []);

  return useMemo(() => ({
    state,
    open: (view) => setState((s) => open(s, view)),
    close: (view) => setState((s) => close(s, view)),
    closeModal: () => setState(closeModal),
    tearOff,
    pullBack: () => setState(pullBack),
  }), [state, tearOff]);
};

/** A view's scrolling content, padded like the rest of the frame. */
export function FullScreenBody(props: { children: ReactNode; gap?: string }) {
  return (
    <Flex direction="column" gap={props.gap} flex="1" minH="0" overflowY="auto" px="6" py="4">
      {props.children}
    </Flex>
  );
}

/** A view's buttons along its bottom edge, at the right. */
export function FullScreenFooter(props: { children: ReactNode }) {
  return (
    <HStack justify="end" gap="3" px="6" py="4">
      {props.children}
    </HStack>
  );
}

type Place =
  | { readonly is: "modal"; readonly slot: HTMLElement }
  | { readonly is: "pip"; readonly win: Window };

/** A view's title bar, with its window buttons, above the view itself. */
function Frame(props: {
  title: string;
  place: Place["is"];
  canPullBack: boolean;
  onTearOff: () => void;
  onPullBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" h="full" minH="0" bg="bg" color="fg">
      <HStack px="6" py="3" gap="2" borderBottomWidth="1px">
        <Text fontWeight="semibold" flex="1" truncate>{props.title}</Text>
        {props.place === "modal" && pipSupported() && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Open in its own window"
            title="Open in its own window"
            onClick={props.onTearOff}
          >
            <LuPictureInPicture2 />
          </IconButton>
        )}
        {props.place === "pip" && props.canPullBack && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="Back to the page"
            title="Back to the page"
            onClick={props.onPullBack}
          >
            <LuSquareArrowDownLeft />
          </IconButton>
        )}
        {props.place === "modal" && (
          <CloseButton size="sm" aria-label="Close" onClick={props.onClose} />
        )}
      </HStack>
      <Flex direction="column" flex="1" minH="0">{props.children}</Flex>
    </Flex>
  );
}

/** One view, rendered into its own container, which is placed in the modal or the PiP window. */
function ViewInstance(props: {
  place: Place;
  content: ViewContent;
  fullScreen: FullScreen;
}) {
  const { place, content, fullScreen } = props;
  const [container] = useState(() => {
    const div = document.createElement("div");
    div.style.cssText = "display: flex; flex-direction: column; height: 100%; min-height: 0";
    return div;
  });
  const target = place.is === "pip" ? place.win.document.body : place.slot;
  useLayoutEffect(() => {
    target.append(container);
  }, [target, container]);
  useLayoutEffect(() => () => container.remove(), [container]);
  useEffect(() => {
    if (place.is === "pip") place.win.document.title = content.title;
  }, [place, content.title]);

  const doc = place.is === "pip" ? place.win.document : document;
  return createPortal(
    <MfeDocument.Provider value={doc}>
      <DocumentStyles document={doc}>
        <Frame
          title={content.title}
          place={place.is}
          canPullBack={canPullBack(fullScreen.state)}
          onTearOff={() => {
            const { width, height } = container.getBoundingClientRect();
            fullScreen.tearOff({ width, height });
          }}
          onPullBack={fullScreen.pullBack}
          onClose={fullScreen.closeModal}
        >
          {content.content}
        </Frame>
      </DocumentStyles>
    </MfeDocument.Provider>,
    container,
  );
}

/** Space kept around a modal, showing the dimmed page. */
const modalMargin = "2rem";

/**
 * Shows the open full-screen views. `render` says what each shows; null closes it
 * (it's about something that's gone).
 */
export function FullScreenHost(props: {
  fullScreen: FullScreen;
  render: (view: FullScreenView) => ViewContent | null;
}) {
  const { fullScreen, render } = props;
  const { state } = fullScreen;
  // Where the modal's view goes. It always exists, and is put in the dialog as the dialog
  // mounts, so the view is in place before the dialog traps focus in it, and a view
  // moving into the modal is in the page's document at once (and styled for it).
  const [slot] = useState(() => {
    const div = document.createElement("div");
    div.style.cssText = "display: flex; flex-direction: column; height: 100%; min-height: 0";
    return div;
  });
  const focusStart = useRef<HTMLSpanElement>(null);
  const modal = state.modal === null ? null : render(state.modal);
  // The dialog keeps its size (and its focus target) while it animates closed.
  const lastModal = useRef<ViewContent | null>(null);
  if (modal !== null) lastModal.current = modal;
  const shown = modal ?? lastModal.current;
  const pip = state.pip === null ? null : render(state.pip.view);
  const fill = `calc(100% - 2 * ${modalMargin})`;
  const instances: ReadonlyArray<{ view: FullScreenView; place: Place; content: ViewContent }> = [
    ...(state.modal !== null && modal !== null
      ? [{ view: state.modal, place: { is: "modal", slot } as const, content: modal }]
      : []),
    ...(state.pip !== null && pip !== null
      ? [{
        view: state.pip.view,
        place: { is: "pip", win: state.pip.window } as const,
        content: pip,
      }]
      : []),
  ];

  return (
    <>
      <Dialog.Root
        open={state.modal !== null}
        onOpenChange={(e) => !e.open && fullScreen.closeModal()}
        placement="center"
        // Focus starts at the top of the view, and stays in the dialog while it closes
        // after its view is torn off (taking the focused button with it).
        initialFocusEl={() => focusStart.current}
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            {shown !== null && (
              <Dialog.Content
                aria-label={shown.title}
                w={shown.width === "full" ? fill : shown.width}
                maxW={fill}
                h={shown.fullHeight ? `calc(100dvh - 2 * ${modalMargin})` : "auto"}
                maxH={`calc(100dvh - 2 * ${modalMargin})`}
                my="0"
                overflow="hidden"
                ref={(content: HTMLDivElement | null) => content?.append(slot)}
              >
                <span ref={focusStart} tabIndex={-1} />
              </Dialog.Content>
            )}
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      {
        // One keyed list, so a view moving between the modal and the PiP window is
        // the same instance in both, and keeps its state.
        instances.map((instance) => (
          <ViewInstance
            key={viewKey(instance.view)}
            place={instance.place}
            content={instance.content}
            fullScreen={fullScreen}
          />
        ))
      }
    </>
  );
}
