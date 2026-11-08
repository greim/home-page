/**
 * What the user sees of a widget's permissions (see permissions.ts): the consent
 * form (its own modal, opened from the card), the notice a widget's card shows
 * until they've agreed, and the note in the column editor.
 */
import { Box, Button, chakra, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { LuExternalLink, LuMessageCircleWarning, LuShieldAlert } from "react-icons/lu";
import type { OutsideService, Permissions } from "../common/widgets.ts";
import { FullScreenBody, FullScreenFooter } from "./full-screen/full-screen-host.tsx";
import type { PermissionState } from "./permissions.ts";

/** A link to an outside site, opening in a new tab. */
function OutsideLink(props: { href: string; children: string }) {
  return (
    <Link href={props.href} target="_blank" rel="noopener noreferrer" colorPalette="blue">
      {props.children} <LuExternalLink />
    </Link>
  );
}

/** Each service: who it is, what it's sent, and its policies. */
function ServiceList(props: { services: ReadonlyArray<OutsideService> }) {
  return (
    <Stack gap="4" as="ul" listStyleType="none">
      {props.services.map((s) => (
        <chakra.li key={s.name} borderWidth="1px" rounded="md" p="4">
          <Text fontWeight="semibold">{s.name}</Text>
          <Text mt="1">
            <chakra.span color="fg.muted">It sees:</chakra.span> {s.sends}
          </Text>
          <HStack gap="4" mt="2" fontSize="sm" wrap="wrap">
            <OutsideLink href={s.privacyPolicy}>Privacy policy</OutsideLink>
            <OutsideLink href={s.terms}>Terms of service</OutsideLink>
          </HStack>
        </chakra.li>
      ))}
    </Stack>
  );
}

/** The permission screen, as a full-screen view: the services, then yes or no. */
export function PermissionsView(props: {
  title: string;
  permissions: Permissions;
  state: PermissionState;
  onAnswer: (yes: boolean) => void;
}) {
  const one = props.permissions.services.length === 1;
  return (
    <>
      <FullScreenBody gap="5">
        <HStack gap="3" align="start">
          <Box color="fg.warning" fontSize="2xl" flexShrink="0">
            <LuShieldAlert />
          </Box>
          <Text>
            <strong>Warning:</strong> the {props.title} widget sends information to{" "}
            {one ? "an outside service" : "outside services"}, below.
            {props.state.is === "unanswered" && props.state.changed &&
              " It has changed what it sends since you last answered."} Please read{" "}
            {one ? "its" : "their"}{" "}
            privacy policy and terms of service. Until you agree, the widget stays off.
          </Text>
        </HStack>
        <ServiceList services={props.permissions.services} />
        <Text fontSize="sm" color="fg.muted">
          Your answer is kept in this browser, for every {props.title}{" "}
          widget. You can change it in the column editor.
        </Text>
      </FullScreenBody>
      <FullScreenFooter>
        <Button variant="outline" onClick={() => props.onAnswer(false)}>
          No, I'm not okay with that
        </Button>
        <Button onClick={() => props.onAnswer(true)}>Yes, I'm okay with that</Button>
      </FullScreenFooter>
    </>
  );
}

/**
 * Shown in a widget's card in place of the widget, until the user agrees to its
 * permissions. Colors and fonts are inherited from the column.
 */
export function PermissionNotice(props: {
  title: string;
  state: PermissionState;
  onReview: () => void;
}) {
  const text = props.state.is === "declined"
    ? `${props.title} is off: you chose not to let it send data to outside services.`
    : props.state.is === "unanswered" && props.state.changed
    ? `${props.title} has changed what it sends to outside services. Review it to turn it back on.`
    : `${props.title} sends data to outside services. Review what it sends before using it.`;
  return (
    <Stack gap="0.6rem" align="start">
      <HStack gap="0.5rem" align="start">
        <Box flexShrink="0" mt="0.2em">
          <LuShieldAlert />
        </Box>
        <Text fontSize="0.9rem">{text}</Text>
      </HStack>
      <Button
        size="sm"
        variant="outline"
        color="inherit"
        onClick={(e) => {
          // The card around it opens the column editor when clicked in admin mode.
          e.stopPropagation();
          props.onReview();
        }}
      >
        Review
      </Button>
    </Stack>
  );
}

/**
 * The column editor's note on a widget that sends data to outside services. The
 * consent form isn't here: it opens from the Review button in the widget's card.
 * Once given, consent can be withdrawn here.
 */
export function PermissionNote(props: {
  state: PermissionState;
  onWithdraw: () => void;
}) {
  const granted = props.state.is === "granted";
  return (
    <HStack gap="3" align="start" borderWidth="1px" rounded="md" p="4">
      <Box color="fg.warning" fontSize="xl" flexShrink="0">
        <LuMessageCircleWarning />
      </Box>
      <Stack gap="2" align="start">
        <Text fontSize="sm">
          {granted
            ? "You've given consent for this widget to send data to outside services."
            : props.state.is === "declined"
            ? "You declined to let this widget send data to outside services, so it's off. To use it, close the column editor, then click Review in its card."
            : "You'll need to give consent before using this widget: it sends data to outside services. Close the column editor, then click Review in its card."}
        </Text>
        {granted && (
          <Button size="xs" variant="outline" onClick={props.onWithdraw}>
            Withdraw consent
          </Button>
        )}
      </Stack>
    </HStack>
  );
}
