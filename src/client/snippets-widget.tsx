import { Box, chakra, Stack, Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { useState } from "react";
import { graphemeLines } from "../common/graphemes.ts";
import type { Snippet, SnippetsWidget as Model } from "../common/model.ts";
import { copyToClipboard } from "./live.ts";

const flashMs = 900;

function useCopy() {
  const [flash, setFlash] = useState<{ key: string; ok: boolean } | null>(null);
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

const pre = {
  as: "pre",
  m: "0",
  px: "2",
  py: "1",
  fontFamily: "mono",
  fontSize: "sm",
  bg: "bg.muted",
  rounded: "sm",
  overflow: "hidden",
  whiteSpace: "pre",
} as const;

function SnippetBody(props: {
  snippet: Snippet;
  flashKey: string | null;
  copy: (key: string, text: string) => void;
}) {
  const { snippet } = props;
  if (snippet.copy === "whole") {
    return (
      <Box
        {...pre}
        cursor="copy"
        title="Click to copy"
        outline={props.flashKey === snippet.id ? "2px solid" : "none"}
        outlineColor="green.500"
        _hover={{ bg: "bg.emphasized" }}
        onClick={() => props.copy(snippet.id, snippet.text)}
      >
        {snippet.text}
      </Box>
    );
  }
  return (
    <Box {...pre} whiteSpace="pre-wrap">
      {graphemeLines(snippet.text).map((line, row) => (
        <Box key={row} minH="1lh">
          {line.map((char, col) => {
            const key = `${snippet.id}:${row}:${col}`;
            return (
              <chakra.span
                key={col}
                cursor="copy"
                rounded="xs"
                px="0.5"
                bg={props.flashKey === key ? "green.subtle" : "transparent"}
                _hover={{ bg: "bg.emphasized" }}
                onClick={() => props.copy(key, char)}
              >
                {char}
              </chakra.span>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

export function SnippetsWidget(props: { widget: Model }) {
  const { flash, copy } = useCopy();
  return (
    <Stack gap="2">
      {props.widget.snippets.map((snippet) => (
        <Box key={snippet.id}>
          <Text fontSize="xs" color="fg.muted" mb="0.5">
            {snippet.label}
            {flash !== null && flash.key.startsWith(snippet.id) && (
              <chakra.span color={flash.ok ? "fg.success" : "fg.error"} ml="2">
                {flash.ok ? "Copied!" : "Copy failed"}
              </chakra.span>
            )}
          </Text>
          <SnippetBody
            snippet={snippet}
            flashKey={flash?.ok ? flash.key : null}
            copy={copy}
          />
        </Box>
      ))}
      {props.widget.snippets.length === 0 && (
        <Text fontSize="sm" color="fg.muted">No snippets yet.</Text>
      )}
    </Stack>
  );
}
