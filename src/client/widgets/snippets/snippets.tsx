import { chakra, Stack, Text, Theme } from "@chakra-ui/react";
import { Effect } from "effect";
import { Fragment, useState } from "react";
import { codeBox, hiddenScrollbar } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { Snippet, SnippetsConfig } from "./config.ts";
import { graphemeLines, isCopyableChar } from "./graphemes.ts";

const copyToClipboard = (text: string): Effect.Effect<void, string> =>
  Effect.tryPromise({ try: () => navigator.clipboard.writeText(text), catch: String });

const flashMs = 900;

function useCopy() {
  const [flash, setFlash] = useState<Flash>(null);
  const copy = (key: string, text: string) =>
    Effect.runPromise(
      copyToClipboard(text).pipe(
        Effect.match({ onSuccess: () => true, onFailure: () => false }),
      ),
    ).then((ok) => {
      setFlash({ key, ok });
      setTimeout(() => setFlash(null), flashMs);
    });
  return { flash, copy };
}

/** Copy feedback for one snippet: the key flashed (the snippet's id, or a character's). */
type Flash = { key: string; ok: boolean } | null;

/**
 * The snippet's label as a comment, like `# restart claude`, with any copy
 * feedback after it. Nothing when there's neither.
 */
function CommentLine(props: { label: string; flash: Flash }) {
  const { label, flash } = props;
  if (label === "" && flash === null) return null;
  return (
    <>
      {label !== "" && <chakra.span opacity={0.5}># {label}</chakra.span>}
      {flash !== null && (
        <chakra.span color={flash.ok ? "fg.success" : "fg.error"}>
          {label !== "" && "  "}
          {flash.ok ? "Copied!" : "Copy failed"}
        </chakra.span>
      )}
      {"\n"}
    </>
  );
}

/** The text exactly as written; each character but whitespace copies on its own when clicked. */
function CharLines(props: {
  snippet: Snippet;
  flashKey: string | null;
  copy: (key: string, text: string) => void;
}) {
  const lines = graphemeLines(props.snippet.text);
  return lines.map((line, row) => (
    <Fragment key={row}>
      {line.map((char, col) => {
        if (!isCopyableChar(char)) return <Fragment key={col}>{char}</Fragment>;
        const key = `${props.snippet.id}:${row}:${col}`;
        return (
          <chakra.span
            key={col}
            cursor="copy"
            rounded="xs"
            bg={props.flashKey === key ? "green.subtle" : "transparent"}
            _hover={{ bg: "whiteAlpha.300" }}
            onClick={() => props.copy(key, char)}
          >
            {char}
          </chakra.span>
        );
      })}
      {row < lines.length - 1 && "\n"}
    </Fragment>
  ));
}

/**
 * A snippet, shown as source code in a dark box: its label as a comment, then
 * its text. A "whole" snippet copies when clicked anywhere; a "char" snippet
 * copies the character clicked.
 */
function SnippetBox(props: {
  snippet: Snippet;
  flash: Flash;
  copy: (key: string, text: string) => void;
}) {
  const { snippet, flash } = props;
  const whole = snippet.copy === "whole";
  const ownFlash = flash !== null && flash.key.startsWith(snippet.id) ? flash : null;
  return (
    // Dark, whatever the column's color, so its tokens (text, hover) are too.
    <Theme
      appearance="dark"
      hasBackground={false}
      css={{ ...codeBox, ...hiddenScrollbar }}
      overflowX="auto"
      {...(whole
        ? {
          cursor: "copy",
          title: "Click to copy",
          outline: ownFlash?.ok ? "2px solid" : "none",
          outlineColor: "green.500",
          _hover: { bg: "gray.700" },
          onClick: () => props.copy(snippet.id, snippet.text),
        }
        : {})}
    >
      <chakra.pre
        m="0"
        px="3"
        py="2"
        fontFamily="mono"
        fontSize="sm"
        color="fg"
        whiteSpace="pre"
      >
        <CommentLine label={snippet.label} flash={ownFlash} />
        {whole ? snippet.text : (
          <CharLines
            snippet={snippet}
            flashKey={ownFlash?.ok ? ownFlash.key : null}
            copy={props.copy}
          />
        )}
      </chakra.pre>
    </Theme>
  );
}

export function Snippets(props: WidgetProps<SnippetsConfig>) {
  const { snippets } = props.config;
  const { flash, copy } = useCopy();
  return (
    <Stack gap="4">
      {snippets.map((snippet) => (
        <SnippetBox key={snippet.id} snippet={snippet} flash={flash} copy={copy} />
      ))}
      {snippets.length === 0 && <Text fontSize="sm" color="fg.muted">No snippets yet.</Text>}
    </Stack>
  );
}
