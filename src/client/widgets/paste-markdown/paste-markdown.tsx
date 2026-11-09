/**
 * A box to paste into. Pasted HTML (what the browser puts on the clipboard
 * when you copy from a web page) goes in as Markdown; plain text goes in as it
 * is. What's in the box is kept in this browser until cleared.
 */
import { chakra, HStack, Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { type ClipboardEvent, useEffect, useState } from "react";
import { widgetHeading } from "../../surface.ts";
import { TextBox } from "../../widget-kit/text-box.tsx";
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

export function PasteMarkdown(props: WidgetProps<PasteMarkdownConfig>) {
  const heading = props.config.heading.trim();
  const [text, setText] = useStoredText(props.widgetId);
  const [flash, setFlash] = useState<"Copied!" | "Copy failed" | null>(null);

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (html === "") return;
    event.preventDefault();
    setText(insert(event.currentTarget, markdownOf(html)));
  };

  const copy = () =>
    Effect.runPromise(
      Effect.tryPromise({ try: () => navigator.clipboard.writeText(text), catch: String }).pipe(
        Effect.match({
          onSuccess: () => "Copied!" as const,
          onFailure: () => "Copy failed" as const,
        }),
      ),
    ).then((result) => {
      setFlash(result);
      setTimeout(() => setFlash(null), flashMs);
    });

  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <TextBox
        spellCheck={false}
        placeholder="Paste from a web page to get Markdown"
        aria-label="Markdown"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
      />
      <HStack mt="0.6rem" gap="0.5rem">
        <TextBoxButton disabled={text === ""} onClick={copy}>Copy</TextBoxButton>
        <TextBoxButton disabled={text === ""} onClick={() => setText("")}>
          Clear
        </TextBoxButton>
        {flash !== null && (
          <Text fontSize="0.85rem" color={flash === "Copied!" ? "fg.success" : "fg.error"}>
            {flash}
          </Text>
        )}
      </HStack>
    </>
  );
}
