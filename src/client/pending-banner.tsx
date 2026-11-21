import { Box, Button, Flex, Input, Text, Theme } from "@chakra-ui/react";
import { bannerTitle, type PendingState, showsBanner } from "./pending-layout.ts";
import { screenshotSkip } from "./screenshot.ts";
import { smallCorners, surface } from "./surface.ts";

/**
 * A block floating in the upper right, always there while the layout has changes nobody has
 * accepted or discarded: it nudges without blocking anything. Accepting keeps the layout as a
 * new version; discarding puts back the last one kept.
 */
export function PendingBanner(props: {
  state: PendingState;
  onAccept: () => void;
  onDiscard: () => void;
  onMessage: (message: string) => void;
  /** Opens the layout's history. */
  onReview: () => void;
}) {
  const { state } = props;
  if (!showsBanner(state)) return null;
  return (
    <Theme appearance="light" hasBackground={false}>
      <Box
        {
          // The agent sees the page itself, not the controls around it.
          ...{ [screenshotSkip]: "" }
        }
        role="status"
        position="fixed"
        top={surface.gap}
        right={surface.gap}
        zIndex="2"
        maxW="22rem"
        p="3"
        bg="white"
        color="fg"
        borderRadius={smallCorners.borderRadius}
        boxShadow={surface.thumbShadow}
      >
        <Text fontSize="sm" fontWeight="medium">{bannerTitle(state)}</Text>
        {state.problem !== null && (
          <Text fontSize="xs" color="fg.error" mt="1">{state.problem}</Text>
        )}
        {state.pending === "modified" && (
          <Input
            size="xs"
            mt="2"
            aria-label="What this change is called"
            placeholder="Describe the change"
            value={state.message}
            maxLength={72}
            onChange={(event) => props.onMessage(event.target.value)}
          />
        )}
        <Flex gap="2" mt="2">
          <Button
            size="xs"
            disabled={state.working || state.pending === null}
            onClick={props.onAccept}
          >
            Accept
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={state.working || state.pending === null}
            onClick={props.onDiscard}
          >
            Discard
          </Button>
          <Button size="xs" variant="ghost" onClick={props.onReview}>History</Button>
        </Flex>
      </Box>
    </Theme>
  );
}
