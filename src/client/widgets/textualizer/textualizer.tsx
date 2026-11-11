/**
 * The textualizer's card: a box to paste into, which shows what was pasted
 * formatted, in miniature, with buttons to clear it, copy it, and open it full
 * screen. The box is empty (waiting for a paste), a dialog (an error, or a
 * question about what was pasted), or a preview.
 */
import { Box, chakra, HStack, Stack, Text } from "@chakra-ui/react";
import { type ClipboardEvent, type ReactNode, useMemo } from "react";
import { LuChevronDown, LuMaximize2 } from "react-icons/lu";
import { codeTextShadow, hiddenScrollbar, widgetHeading } from "../../surface.ts";
import { TextBox, textBoxStyle } from "../../widget-kit/text-box.tsx";
import { TextBoxButton } from "../../widget-kit/text-box-button.tsx";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import { type Box as BoxState, useBox } from "./box-live.ts";
import type { TextualizerConfig } from "./config.ts";
import { formattedTree } from "./convert.ts";
import { CopyFlash, CopyMenu, useCopy } from "./copy-menu.tsx";
import { parseHtml } from "./dom.ts";
import { type Choice, chosenSource, readPaste, unsupportedMessage } from "./paste.ts";
import { kindLabels, kinds, type Source } from "./source.ts";
import { Formatted } from "./formatted.tsx";
import { miniatureFont } from "./styles.ts";

/** The box's one size: it never grows to fit what's in it, and can't be resized. */
const boxHeight = "10rem";

/** A tight shadow, so a dialog's text and buttons stand out from the box under them. */
const dialogShadow = "0 0.05rem 0.15rem rgba(0, 0, 0, 0.8)";

/** What a paste puts in the box. */
const pasted = (event: ClipboardEvent): BoxState => {
  const data = event.clipboardData;
  const html = data.getData("text/html");
  const result = readPaste({
    // A file's own type (e.g. image/png), not just "Files".
    types: Array.from(new Set(Array.from(data.items, (i) => i.type || "a file"))),
    html: html === "" ? null : parseHtml(html),
    text: data.getData("text/plain"),
  });
  switch (result.is) {
    case "ready":
      return { is: "preview", source: result.source };
    case "ask":
      return { is: "question", text: result.text };
    case "unsupported":
      return { is: "error", message: unsupportedMessage(result.types) };
    default:
      return result satisfies never;
  }
};

/** A message and buttons, floating in the middle of the box. */
function Dialog(props: { message: string; children: ReactNode }) {
  return (
    <Stack
      position="absolute"
      inset="0"
      align="center"
      justify="center"
      gap="0.5rem"
      p="0.6rem"
      role="alertdialog"
      aria-label={props.message}
    >
      <Text fontSize="0.8rem" textAlign="center" textShadow={dialogShadow}>{props.message}</Text>
      <HStack gap="0.35rem" wrap="wrap" justify="center">{props.children}</HStack>
    </Stack>
  );
}

function DialogButton(props: { onClick: () => void; children: ReactNode }) {
  return (
    <TextBoxButton size="xs" boxShadow={dialogShadow} onClick={props.onClick}>
      {props.children}
    </TextBoxButton>
  );
}

/** The source formatted, in miniature, in a box just like the text box, with a badge. */
function Preview({ source }: { source: Source }) {
  const tree = useMemo(() => formattedTree(source, parseHtml), [source]);
  return (
    <>
      <chakra.div
        {...textBoxStyle}
        css={{ ...textBoxStyle.css, ...hiddenScrollbar }}
        resize="none"
        h={boxHeight}
        overflow="auto"
        textShadow={codeTextShadow}
        tabIndex={0}
        role="region"
        aria-label={`${kindLabels[source.kind]} preview`}
      >
        <Formatted tree={tree} {...miniatureFont} />
      </chakra.div>
      <Text
        position="absolute"
        bottom="0.35rem"
        right="0.45rem"
        pointerEvents="none"
        fontSize="0.55rem"
        fontWeight="bold"
        lineHeight="1"
        px="0.35em"
        py="0.25em"
        borderRadius="0.25em"
        bg="rgba(0, 0, 0, 0.55)"
        textShadow="none"
      >
        {kindLabels[source.kind]}
      </Text>
    </>
  );
}

export function Textualizer({ config, widgetId, openFullScreen }: WidgetProps<TextualizerConfig>) {
  const heading = config.heading.trim();
  const [box, setBox] = useBox(widgetId);
  const source = box.is === "preview" ? box.source : null;
  const { flash, copy } = useCopy(source, parseHtml);
  const clear = () => setBox({ is: "empty" });
  const choose = (text: string, choice: Choice) =>
    setBox({ is: "preview", source: chosenSource(text, choice) });

  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      <Box position="relative">
        {box.is === "preview" ? <Preview source={box.source} /> : (
          // Only ever empty: it takes a paste, and nothing typed or dropped.
          <TextBox
            resize="none"
            h={boxHeight}
            textShadow={codeTextShadow}
            spellCheck={false}
            value=""
            onChange={() => {}}
            onDrop={(e) => e.preventDefault()}
            placeholder={box.is === "empty"
              ? "Paste formatted text, Markdown, HTML, code or JSON"
              : undefined}
            aria-label="Paste here"
            readOnly={box.is !== "empty"}
            tabIndex={box.is === "empty" ? 0 : -1}
            pointerEvents={box.is === "empty" ? "auto" : "none"}
            onPaste={(event) => {
              event.preventDefault();
              if (box.is === "empty") setBox(pasted(event));
            }}
          />
        )}
        {box.is === "error" && (
          <Dialog message={box.message}>
            <DialogButton onClick={clear}>OK</DialogButton>
          </Dialog>
        )}
        {box.is === "question" && (
          <Dialog message="What kind of text is this?">
            <DialogButton onClick={() => choose(box.text, "guess")}>Best guess</DialogButton>
            {kinds.map((kind) => (
              <DialogButton key={kind} onClick={() => choose(box.text, kind)}>
                {kindLabels[kind]}
              </DialogButton>
            ))}
            <DialogButton onClick={clear}>Cancel</DialogButton>
          </Dialog>
        )}
        <CopyFlash flash={flash} />
      </Box>
      <HStack mt="0.6rem" gap="0.5rem">
        <TextBoxButton disabled={source === null} onClick={clear}>Clear</TextBoxButton>
        <CopyMenu
          portalled
          onCopy={copy}
          trigger={
            <TextBoxButton disabled={source === null}>
              Copy as <LuChevronDown />
            </TextBoxButton>
          }
        />
        <TextBoxButton ms="auto" disabled={source === null} onClick={openFullScreen}>
          <LuMaximize2 /> Full screen
        </TextBoxButton>
      </HStack>
    </>
  );
}
