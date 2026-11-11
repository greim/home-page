/** How formatted content is styled, in the card's miniature preview and full screen. */

/**
 * The card's preview, set in miniature so more of it fits in the box. Sans-serif,
 * unlike the rest of the page, so that `code` stands out in monospace.
 */
export const miniatureFont = {
  fontFamily: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontSize: "0.62rem",
} as const;

/** How formatted content is laid out and styled, in ems of its font size. */
export const formattedContent = {
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
  // Code pasted on its own (TypeScript, JSON) is the whole preview, so needs no box of its own.
  "& > pre:only-child": { bg: "transparent", p: 0, borderRadius: 0, my: 0 },
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
