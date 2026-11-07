import { Button, type ButtonProps, Flex, Text, Theme } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { screenshotSkip } from "./screenshot.ts";
import { smallCorners, surface } from "./surface.ts";

const { gap, adminBarHeight } = surface;

/**
 * The strip along the top of the viewport in admin mode, saying how to leave it.
 * It hangs from the top edge (no space above it), centered and only as
 * wide as its contents, with squircled bottom corners. It stays mounted, sliding
 * up off-screen (and inert) when hidden, so it can animate both in and out.
 */
export function AdminBar(props: {
  shown: boolean;
  message: string;
  onExit: () => void;
}) {
  return (
    <Theme appearance="light" hasBackground={false}>
      <Flex
        {
          // The agent sees the page itself, not the controls for editing it.
          ...{ [screenshotSkip]: "" }
        }
        position="absolute"
        top="0"
        left="0"
        right="0"
        mx="auto"
        zIndex="1"
        transform={props.shown ? "none" : "translateY(-100%)"}
        transition={`transform ${surface.adminTransition}`}
        _motionReduce={{ transition: "none" }}
        inert={!props.shown}
        h={adminBarHeight}
        w="fit-content"
        maxW={`calc(100% - 2 * ${gap})`}
        bg="white"
        color="fg"
        align="stretch"
        overflow="hidden"
        borderBottomRadius={smallCorners.borderRadius}
        // White on the white surface, so a shadow shows its edge. Only while shown,
        // or it would peek out below the top of the window.
        boxShadow={props.shown ? surface.thumbShadow : "none"}
      >
        <AdminBarButton
          title="Exit admin mode"
          aria-label="Exit admin mode"
          px="3"
          onClick={props.onExit}
        >
          <LuX />
        </AdminBarButton>
        <Text alignSelf="center" ps="1" pe="4" fontSize="sm" color="fg.muted">
          {props.message}
        </Text>
      </Flex>
    </Theme>
  );
}

/** A button whose clickable area is the bar's full height. */
function AdminBarButton(props: ButtonProps) {
  return <Button variant="ghost" size="sm" h="full" rounded="none" px="4" {...props} />;
}
