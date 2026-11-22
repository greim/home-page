import { Box } from "@chakra-ui/react";
import Markdown from "react-markdown";

/** The agent's text, which is Markdown. Raw HTML in it is shown as text, never run. */
export function MarkdownText(props: { text: string }) {
  return (
    <Box
      fontSize="sm"
      lineHeight="1.6"
      css={{
        "& > :first-child": { marginTop: 0 },
        "& > :last-child": { marginBottom: 0 },
        "& p, & ul, & ol, & pre, & blockquote, & table": { marginBlock: "0.6em" },
        "& ul, & ol": { paddingInlineStart: "1.4em" },
        "& ul": { listStyleType: "disc" },
        "& ol": { listStyleType: "decimal" },
        "& h1, & h2, & h3, & h4": { fontWeight: "semibold", marginBlock: "0.8em 0.4em" },
        "& code": {
          fontFamily: "mono",
          fontSize: "0.9em",
          bg: "bg.muted",
          px: "0.25em",
          rounded: "l1",
        },
        "& pre": { bg: "bg.muted", p: "2", rounded: "l2", overflowX: "auto" },
        "& pre code": { bg: "transparent", px: 0 },
        "& a": { color: "fg.info", textDecoration: "underline" },
        "& blockquote": { borderInlineStartWidth: "2px", ps: "2", color: "fg.muted" },
        "& table": { borderCollapse: "collapse" },
        "& th, & td": { borderWidth: "1px", px: "1.5", py: "0.5" },
      }}
    >
      <Markdown
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {props.text}
      </Markdown>
    </Box>
  );
}
