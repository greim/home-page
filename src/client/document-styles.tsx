/**
 * Styles a React subtree for the document it's shown in: the page's, or a
 * picture-in-picture window's. Emotion inserts its styles, and Chakra opens its
 * overlays, in that document; and rem follows the page's viewport-relative size
 * there, or the browser's default in a window of its own.
 *
 * The tree is the same whichever document it's given, so a subtree moved to
 * another window and re-rendered with its new document keeps its state.
 */
import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ChakraProvider, EnvironmentProvider, type SystemContext } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { makeSystem } from "./chakra-system.ts";
import { windowRootFontSize } from "./surface.ts";

const caches = new WeakMap<Document, EmotionCache>();

/** One Emotion cache per document, inserting into its head. "css" is Emotion's default key. */
const cacheFor = (doc: Document): EmotionCache => {
  const cached = caches.get(doc);
  if (cached !== undefined) return cached;
  const cache = createCache({
    key: doc === globalThis.document ? "css" : "pip",
    container: doc.head,
  });
  caches.set(doc, cache);
  return cache;
};

let pageSystem: SystemContext | null = null;
let windowSystem: SystemContext | null = null;

/** The page's Chakra system, or a window's (made when first needed). */
const systemFor = (doc: Document): SystemContext => {
  if (doc === globalThis.document) {
    pageSystem ??= makeSystem();
    return pageSystem;
  }
  windowSystem ??= makeSystem(windowRootFontSize);
  return windowSystem;
};

export function DocumentStyles(props: { document: Document; children: ReactNode }) {
  const doc = props.document;
  return (
    <CacheProvider value={cacheFor(doc)}>
      <EnvironmentProvider value={() => doc}>
        <ChakraProvider value={systemFor(doc)}>{props.children}</ChakraProvider>
      </EnvironmentProvider>
    </CacheProvider>
  );
}
