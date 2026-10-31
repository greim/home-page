import { Box, chakra, Link } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { BookmarksWidget as Model, Link as LinkModel } from "../common/model.ts";

function LinkItem(props: { link: LinkModel }) {
  return (
    <chakra.li py="0.5" truncate>
      <Link href={props.link.url} target="_blank" rel="noreferrer" title={props.link.url}>
        {props.link.label || props.link.url}
      </Link>
    </chakra.li>
  );
}

export function BookmarksWidget(props: {
  widget: Model;
  onToggleFolder: (folderId: string) => void;
}) {
  return (
    <chakra.ul listStyleType="none" m="0" p="0" fontSize="sm">
      {props.widget.items.map((node) => {
        switch (node.is) {
          case "link":
            return <LinkItem key={node.id} link={node} />;
          case "folder":
            return (
              <chakra.li key={node.id} py="0.5">
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
                  <chakra.ul listStyleType="none" m="0" pl="5">
                    {node.children.map((link) => <LinkItem key={link.id} link={link} />)}
                  </chakra.ul>
                )}
              </chakra.li>
            );
          default:
            return node satisfies never;
        }
      })}
      {props.widget.items.length === 0 && <Box as="li" color="fg.muted">No bookmarks yet.</Box>}
    </chakra.ul>
  );
}
