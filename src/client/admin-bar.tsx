import { Button, type ButtonProps, Flex, Text, Theme } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { screenshotSkip } from "./screenshot.ts";
import { smallCorners, surface } from "./surface.ts";

const { gap, adminBarHeight } = surface;

/**
 * The strip along the top of the viewport in admin mode, holding admin-wide
 * controls. It hangs from the top edge (no space above it), centered and only as
 * wide as its contents, with squircled bottom corners. It stays mounted, sliding
 * up off-screen (and inert) when hidden, so it can animate both in and out.
 */
export function AdminBar(props: {
  shown: boolean;
  children: ReactNode;
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
        css={{ cornerShape: smallCorners.cornerShape }}
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
        {props.children}
      </Flex>
    </Theme>
  );
}

/** A button whose clickable area is the bar's full height. */
export function AdminBarButton(props: ButtonProps) {
  return <Button variant="ghost" size="sm" h="full" rounded="none" px="4" {...props} />;
}
