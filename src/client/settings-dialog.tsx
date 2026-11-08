/**
 * The page's settings: when the user's day starts and ends, and which days are
 * their weekend. Opened from the gear in the admin bar; saving sets the layout's
 * schedule.
 */
import {
  Box,
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  Group,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import type { DayOfWeek, Schedule } from "../common/day-cycle.ts";
import type { LayoutAction } from "../common/layout-ops.ts";
import { Label } from "./widget-kit/form.tsx";
import {
  dialogWeek,
  finishSettingsDraft,
  toggleWeekendDay,
  toSettingsDraft,
} from "./settings-draft.ts";

/** "monday" → "Mon". */
const shortName = (day: DayOfWeek): string => day.charAt(0).toUpperCase() + day.slice(1, 3);
const fullName = (day: DayOfWeek): string => day.charAt(0).toUpperCase() + day.slice(1);

export function SettingsDialog(props: {
  schedule: Schedule;
  onSave: (action: LayoutAction) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => toSettingsDraft(props.schedule));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const finished = finishSettingsDraft(draft);
    if (finished.ok) {
      props.onSave({ is: "set-schedule", schedule: finished.schedule });
      return;
    }
    setError(finished.errorMessage);
  };

  return (
    <Dialog.Root open onOpenChange={(e) => !e.open && props.onClose()}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Settings</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="6">
                <Text fontSize="sm" color="fg.muted">
                  Your working hours and weekend. The workday bar uses them to show how far through
                  your workday, evening or weekend you are, and the page turns to night outside your
                  hours.
                </Text>
                <HStack gap="4" align="start">
                  <Box flex="1">
                    <Label>Day starts</Label>
                    <Input
                      type="time"
                      size="sm"
                      value={draft.startOfDay}
                      onChange={(e) => setDraft({ ...draft, startOfDay: e.target.value })}
                    />
                  </Box>
                  <Box flex="1">
                    <Label>Day ends</Label>
                    <Input
                      type="time"
                      size="sm"
                      value={draft.endOfDay}
                      onChange={(e) => setDraft({ ...draft, endOfDay: e.target.value })}
                    />
                  </Box>
                </HStack>
                <Box>
                  <Label>Weekend</Label>
                  <Group attached w="full" role="group" aria-label="Weekend days">
                    {dialogWeek.map((day) => {
                      const on = draft.hasWeekend && draft.weekendDays.includes(day);
                      return (
                        <Button
                          key={day}
                          flex="1"
                          size="sm"
                          variant={on ? "solid" : "outline"}
                          aria-pressed={on}
                          aria-label={fullName(day)}
                          title={fullName(day)}
                          disabled={!draft.hasWeekend}
                          onClick={() => setDraft(toggleWeekendDay(draft, day))}
                        >
                          {shortName(day)}
                        </Button>
                      );
                    })}
                  </Group>
                  <Checkbox.Root
                    mt="3"
                    size="sm"
                    checked={!draft.hasWeekend}
                    onCheckedChange={(e) => setDraft({ ...draft, hasWeekend: e.checked !== true })}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                    <Checkbox.Label>I don't have a set weekend</Checkbox.Label>
                  </Checkbox.Root>
                  {!draft.hasWeekend && (
                    <Text fontSize="sm" color="fg.muted" mt="1">
                      Every day counts as a workday, so the workday bar never switches to the
                      weekend.
                    </Text>
                  )}
                </Box>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              {error !== null && <Text color="fg.error" fontSize="sm" me="auto">{error}</Text>}
              <Button variant="outline" onClick={props.onClose}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
