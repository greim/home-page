import { Box, chakra, Link } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { widgetTextIndent } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import { type BookmarksConfig, type Link as LinkModel, toggleFolder } from "./config.ts";

// Heading text (the widget's and each folder's) sits one indent in, after its chevron; link
// text sits one level deeper, with its bullet hanging in the space between.
const linkIndent = `calc(2 * ${widgetTextIndent})`;

function LinkItem(props: { link: LinkModel }) {
  return (
    // Truncating on an inner block, since overflow:hidden on the li would clip its bullet.
    <chakra.li py="0.5" ms={linkIndent}>
      <chakra.span display="block" truncate>
        <Link href={props.link.url} target="_blank" rel="noreferrer" title={props.link.url}>
          {props.link.label || props.link.url}
        </Link>
      </chakra.span>
    </chakra.li>
  );
}

export function Bookmarks(props: WidgetProps<BookmarksConfig>) {
  const { config, saveConfig } = props;
  return (
    <chakra.ul listStyleType="disc" m="0" ps="0" fontSize="sm">
      {config.items.map((node) => {
        switch (node.is) {
          case "link":
            return <LinkItem key={node.id} link={node} />;
          case "folder":
            return (
              <chakra.li key={node.id} py="0.5" listStyleType="none">
                <chakra.button
                  display="flex"
                  alignItems="center"
                  gap="1"
                  cursor="pointer"
                  fontWeight="medium"
                  onClick={() => saveConfig(toggleFolder(config, node.id))}
                  aria-expanded={node.expanded}
                >
                  {node.expanded ? <LuChevronDown /> : <LuChevronRight />}
                  {node.label}
                </chakra.button>
                {node.expanded && (
                  <chakra.ul listStyleType="disc" m="0" ps="0">
                    {node.children.map((link) => <LinkItem key={link.id} link={link} />)}
                  </chakra.ul>
                )}
              </chakra.li>
            );
          default:
            return node satisfies never;
        }
      })}
      {config.items.length === 0 && (
        <Box as="li" listStyleType="none" ms={widgetTextIndent} color="fg.muted">
          No bookmarks yet.
        </Box>
      )}
    </chakra.ul>
  );
}
