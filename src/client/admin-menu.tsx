import { IconButton, Menu, Portal } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuEllipsisVertical } from "react-icons/lu";

export type MenuAction = {
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly danger: boolean;
  readonly onSelect: () => void;
};

export const action = (
  value: string,
  label: string,
  onSelect: () => void,
  options: { disabled?: boolean; danger?: boolean } = {},
): MenuAction => ({
  value,
  label,
  onSelect,
  disabled: options.disabled ?? false,
  danger: options.danger ?? false,
});

export function ActionMenu(props: {
  label: string;
  actions: ReadonlyArray<MenuAction>;
  trigger?: ReactNode;
  /** False inside a dialog, which the menu must render within to appear above it. */
  portalled: boolean;
}) {
  return (
    <Menu.Root
      onSelect={(details) => props.actions.find((a) => a.value === details.value)?.onSelect()}
    >
      <Menu.Trigger asChild>
        {props.trigger ?? (
          <IconButton aria-label={props.label} size="2xs" variant="ghost">
            <LuEllipsisVertical />
          </IconButton>
        )}
      </Menu.Trigger>
      <Portal disabled={!props.portalled}>
        <Menu.Positioner>
          <Menu.Content>
            {props.actions.map((a) => (
              <Menu.Item
                key={a.value}
                value={a.value}
                disabled={a.disabled}
                color={a.danger ? "fg.error" : "fg"}
              >
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
