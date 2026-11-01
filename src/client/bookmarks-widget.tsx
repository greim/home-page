import { Box, chakra, Link } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { BookmarksWidget as Model, Link as LinkModel } from "../common/model.ts";
import { widgetTextIndent } from "./surface.ts";

function LinkItem(props: { link: LinkModel }) {
  return (
    // Truncating on an inner block, since overflow:hidden on the li would clip its bullet.
    <chakra.li py="0.5">
      <chakra.span display="block" truncate>
        <Link href={props.link.url} target="_blank" rel="noreferrer" title={props.link.url}>
          {props.link.label || props.link.url}
        </Link>
      </chakra.span>
    </chakra.li>
  );
}

export function BookmarksWidget(props: {
  widget: Model;
  onToggleFolder: (folderId: string) => void;
}) {
  return (
    // Bullets hang in the indent, so item text lines up with the widget heading's text.
    <chakra.ul listStyleType="disc" m="0" ps={widgetTextIndent} fontSize="sm">
      {props.widget.items.map((node) => {
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
                  onClick={() => props.onToggleFolder(node.id)}
                  aria-expanded={node.expanded}
                >
                  {node.expanded ? <LuChevronDown /> : <LuChevronRight />}
                  {node.label}
                </chakra.button>
                {node.expanded && (
                  <chakra.ul listStyleType="disc" m="0" ps="5">
                    {node.children.map((link) => <LinkItem key={link.id} link={link} />)}
                  </chakra.ul>
                )}
              </chakra.li>
            );
          default:
            return node satisfies never;
        }
      })}
      {props.widget.items.length === 0 && (
        <Box as="li" listStyleType="none" color="fg.muted">No bookmarks yet.</Box>
      )}
    </chakra.ul>
  );
}
