/**
 * A box to paste into. Pasted HTML (what the browser puts on the clipboard
 * when you copy from a web page) goes in as Markdown; plain text goes in as it
 * is. What's in the box is kept in this browser until cleared. A preview shows
 * the Markdown rendered, in a box just like the text box. Copy and cut take the
 * Markdown as plain text, or in preview, the rendered HTML.
 */
import { Box, chakra, HStack, Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeBox, codeTextShadow, hiddenScrollbar, widgetHeading } from "../../surface.ts";
import { TextBox, textBoxStyle } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { PasteMarkdownConfig } from "./config.ts";
import { type HtmlNode, htmlToMarkdown } from "./html-to-markdown.ts";

/** The browser's parse of some HTML, as the converter's tree. */
const fromDom = (node: Node): ReadonlyArray<HtmlNode> => {
  if (node.nodeType === Node.TEXT_NODE) return [{ is: "text", text: node.textContent ?? "" }];
  if (!(node instanceof Element)) return [];
  return [{
    is: "element",
    tag: node.localName,
    attrs: Object.fromEntries(Array.from(node.attributes, (a) => [a.name, a.value])),
    children: Array.from(node.childNodes).flatMap(fromDom),
  }];
};

const markdownOf = (html: string): string =>
  htmlToMarkdown(
    Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes).flatMap(
      fromDom,
    ),
  );

/** Puts text in place of the box's selection, undoably where the browser allows. */
const insert = (box: HTMLTextAreaElement, text: string): string => {
  box.focus();
  // Deprecated, but the only way to edit a textarea that keeps its undo history.
  if (document.execCommand("insertText", false, text)) return box.value;
  const { selectionStart: start, selectionEnd: end, value } = box;
  return value.slice(0, start) + text + value.slice(end);
};

/** What's in the box, kept in localStorage per widget. */
function useStoredText(widgetId: string) {
  const key = `paste-markdown:${widgetId}`;
  const [text, setText] = useState(() => localStorage.getItem(key) ?? "");
  useEffect(() => {
    if (text === "") localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  }, [key, text]);
  return [text, setText] as const;
}

const flashMs = 900;

/** An element's height in rem, so a box keeps its height as the page scales. */
const remHeight = (el: HTMLElement): string =>
  `${el.offsetHeight / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`;

/**
 * Rendered Markdown, set in miniature so more of it fits in the box. Sans-serif,
 * unlike the rest of the page, so that `code` stands out in monospace.
 */
const previewFont = {
  fontFamily: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontSize: "0.62rem",
} as const;

/** How the rendered Markdown is laid out and styled, in ems of `previewFont`. */
const previewContent = {
  lineHeight: "1.4",
  overflowWrap: "anywhere",
  "& > :first-child": { mt: 0 },
  "& > :last-child": { mb: 0 },
  "& :is(p, ul, ol, pre, blockquote, table, hr)": { my: "0.6em" },
  "& :is(h1, h2, h3, h4, h5, h6)": {
    fontWeight: "bold",
    lineHeight: "1.2",
    mt: "1em",
    mb: "0.4em",
  },
  "& h1": { fontSize: "1.5em" },
  "& h2": { fontSize: "1.3em" },
  "& h3": { fontSize: "1.15em" },
  "& :is(h4, h5, h6)": { fontSize: "1em" },
  "& :is(ul, ol)": { ps: "1.8em" },
  "& ul": { listStyleType: "disc" },
  "& ol": { listStyleType: "decimal" },
  "& li > :is(ul, ol)": { my: "0.2em" },
  "& li + li": { mt: "0.2em" },
  "& a": { textDecoration: "underline", textUnderlineOffset: "0.15em" },
  "& strong": { fontWeight: "bold" },
  "& em": { fontStyle: "italic" },
  "& del": { textDecoration: "line-through" },
  "& code": {
    fontFamily: "mono",
    fontSize: "0.9em",
    bg: "rgba(0, 0, 0, 0.25)",
    borderRadius: "0.2em",
    px: "0.25em",
  },
  "& pre": { bg: "rgba(0, 0, 0, 0.25)", borderRadius: "0.3em", px: "0.6em", py: "0.5em" },
  "& pre code": { bg: "transparent", p: 0, fontSize: "0.95em" },
  "& pre, & pre code": { whiteSpace: "pre-wrap" },
  "& blockquote": { borderStartWidth: "0.2em", borderColor: "currentColor/40", ps: "0.7em" },
  "& blockquote > *": { opacity: 0.85 },
  "& hr": { borderTopWidth: "1px", borderColor: "currentColor/30" },
  "& table": { borderCollapse: "collapse", fontSize: "0.95em" },
  "& :is(th, td)": {
    borderWidth: "1px",
    borderColor: "currentColor/30",
    px: "0.4em",
    py: "0.2em",
    textAlign: "start",
    verticalAlign: "top",
  },
  "& th": { fontWeight: "bold", bg: "rgba(0, 0, 0, 0.2)" },
  "& img": { display: "inline-block", maxW: "100%" },
  "& input[type=checkbox]": { me: "0.4em", verticalAlign: "middle" },
} as const;

/** What goes on the clipboard: the Markdown itself, or the preview's HTML (with its text). */
const clipboardWrite = (text: string, preview: HTMLElement | null): Promise<void> =>
  preview === null ? navigator.clipboard.writeText(text) : navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([preview.innerHTML], { type: "text/html" }),
      "text/plain": new Blob([preview.innerText], { type: "text/plain" }),
    }),
  ]);

export function PasteMarkdown(props: WidgetProps<PasteMarkdownConfig>) {
  const heading = props.config.heading.trim();
  const [text, setText] = useStoredText(props.widgetId);
  const [flash, setFlash] = useState<"Copied!" | "Cut!" | "Copy failed" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // The box's height when it's been resized, kept between the text box and the preview.
  const [height, setHeight] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /** Shows the preview or the Markdown, keeping the box's height. */
  const showPreview = (preview: boolean) => {
    const shown = previewing ? previewRef.current : boxRef.current;
    if (shown !== null) setHeight(remHeight(shown));
    setPreviewing(preview);
  };

  /** Empties the box, back in Markdown mode to paste again. */
  const clear = () => {
    showPreview(false);
    setText("");
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (html === "") return;
    event.preventDefault();
    setText(insert(event.currentTarget, markdownOf(html)));
  };

  const copy = (then: "copy" | "cut") =>
    Effect.runPromise(
      Effect.tryPromise({
        try: () => clipboardWrite(text, previewing ? contentRef.current : null),
        catch: String,
      }).pipe(
        Effect.match({
          onSuccess: () => then === "cut" ? "Cut!" as const : "Copied!" as const,
          onFailure: () => "Copy failed" as const,
        }),
      ),
    ).then((result) => {
      if (result === "Cut!") clear();
      setFlash(result);
      setTimeout(() => setFlash(null), flashMs);
    });

  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      {/* Holds the box and, over it, the brief note after copying or cutting. */}
      <Box position="relative">
        {previewing
          ? (
            // The box is the text box's, padding and all; the miniature type is inside it.
            <chakra.div
              ref={previewRef}
              {...textBoxStyle}
              css={{ ...codeBox, ...hiddenScrollbar }}
              textShadow={codeTextShadow}
              overflowY="auto"
              h={height ?? undefined}
              tabIndex={0}
              role="region"
              aria-label="Markdown preview"
            >
              {text === ""
                ? <Text opacity={0.5}>Nothing to preview</Text>
                : (
                  <chakra.div ref={contentRef} {...previewFont} css={previewContent}>
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node: _, ...a }) => (
                          <a {...a} target="_blank" rel="noopener noreferrer" />
                        ),
                      }}
                    >
                      {text}
                    </Markdown>
                  </chakra.div>
                )}
            </chakra.div>
          )
          : (
            <TextBox
              ref={boxRef}
              h={height ?? undefined}
              textShadow={codeTextShadow}
              spellCheck={false}
              placeholder="Paste from a web page to get Markdown"
              aria-label="Markdown"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
            />
          )}
        {flash !== null && (
          <Text
            position="absolute"
            bottom="0.6rem"
            left="50%"
            transform="translateX(-50%)"
            pointerEvents="none"
            whiteSpace="nowrap"
            fontSize="0.75rem"
            px="0.6em"
            py="0.25em"
            borderRadius="0.3em"
            bg="black"
            color={flash === "Copy failed" ? "red.300" : "green.300"}
            textShadow="none"
            role="status"
          >
            {flash}
          </Text>
        )}
      </Box>
      <HStack mt="0.6rem" gap="0.5rem">
        <TextBoxButton
          disabled={text === ""}
          onClick={() => copy("copy")}
        >
          Copy
        </TextBoxButton>
        <TextBoxButton disabled={text === ""} onClick={() => copy("cut")}>Cut</TextBoxButton>
        <TextBoxButton disabled={text === ""} onClick={clear}>
          Clear
        </TextBoxButton>
        <TextBoxButton ms="auto" aria-pressed={previewing} onClick={() => showPreview(!previewing)}>
          {previewing ? "Markdown" : "Preview"}
        </TextBoxButton>
      </HStack>
    </>
  );
}
