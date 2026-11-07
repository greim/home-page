import { chakra, Link } from "@chakra-ui/react";
import { widgetHeading } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import {
  type BookmarksConfig,
  type Link as LinkModel,
  toggleCollapsed,
  toggleFolder,
} from "./config.ts";

/*
 * List markers are box-drawing characters, added in CSS: "▪" before a top-level
 * link, "+" or "-" before a closed or open folder, and a branch ("├─", or "╰─"
 * for the last) before each link in a folder.
 */

/** A marker in front of a list item's text, kept whole however narrow the column. */
const marker = (content: string) => ({
  content: `"${content}"`,
  whiteSpace: "pre",
  flexShrink: 0,
});

const topLevelLink = { _before: marker("▪ ") } as const;

const folderLink = {
  fontSize: "90%",
  lineHeight: "1.3",
  _before: { ...marker("├─"), fontSize: "110%", me: "0.2em", opacity: 0.6 },
  _last: { _before: { content: `"╰─"` } },
} as const;

function LinkItem(props: { link: LinkModel; inFolder: boolean }) {
  return (
    <chakra.li display="flex" {...(props.inFolder ? folderLink : topLevelLink)}>
      {/* Truncates on its own, so the marker stays whole. */}
      <chakra.span minW="0" truncate>
        <Link
          href={props.link.url}
          target="_blank"
          rel="noreferrer"
          title={props.link.url}
          color="inherit"
          textDecoration="none"
          _hover={{ textDecoration: "underline" }}
        >
          {props.link.label || props.link.url}
        </Link>
      </chakra.span>
    </chakra.li>
  );
}

const list = { listStyle: "none", m: "0", p: "0" } as const;

export function Bookmarks(props: WidgetProps<BookmarksConfig>) {
  const { config, saveConfig } = props;
  const heading = config.heading.trim();
  // Without a heading there's nothing to open it with, so it's always open.
  const open = heading === "" || !config.collapsed;
  return (
    <>
      {heading !== "" && (
        <chakra.button
          {...widgetHeading}
          // Closed, the heading is all there is: no space below it.
          mb={open ? widgetHeading.mb : "0"}
          cursor="pointer"
          textAlign="start"
          _before={{ content: open ? `"⏷ "` : `"⏵ "`, whiteSpace: "pre" }}
          aria-expanded={open}
          onClick={() => saveConfig(toggleCollapsed(config))}
        >
          {heading}
        </chakra.button>
      )}
      {open && (
        <chakra.ul {...list}>
          {config.items.map((node) => {
            switch (node.is) {
              case "link":
                return <LinkItem key={node.id} link={node} inFolder={false} />;
              case "folder":
                return (
                  <chakra.li key={node.id}>
                    <chakra.button
                      cursor="pointer"
                      textAlign="start"
                      _before={marker(node.expanded ? "- " : "+ ")}
                      onClick={() => saveConfig(toggleFolder(config, node.id))}
                      aria-expanded={node.expanded}
                    >
                      {node.label}
                    </chakra.button>
                    {node.expanded && (
                      <chakra.ul {...list} ps="1em" mb="0.6em">
                        {node.children.map((link) => (
                          <LinkItem key={link.id} link={link} inFolder />
                        ))}
                      </chakra.ul>
                    )}
                  </chakra.li>
                );
              default:
                return node satisfies never;
            }
          })}
          {config.items.length === 0 && <chakra.li opacity={0.7}>No bookmarks yet.</chakra.li>}
        </chakra.ul>
      )}
    </>
  );
}
