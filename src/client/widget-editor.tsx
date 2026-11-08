/** One widget's pane in the column editor: its own editor view. */
import { Stack, Text } from "@chakra-ui/react";
import { useMemo, useRef } from "react";
import { MfeView } from "./mfe/mfe-view.tsx";
import { WidgetProblem } from "./widget-card.tsx";
import { type DraftReport, editorViewName, type EditorViewProps } from "./widget-kit/contract.ts";
import { Label } from "./widget-kit/form.tsx";
import { type Draft, draftConfig, withReport } from "./widget-draft.ts";
import { registeredTypes, useWidgetHost } from "./widget-host.tsx";
import { answer, usePermissions } from "./permissions-live.ts";
import { PermissionNote } from "./permissions-view.tsx";

/** The widget type's editor view, started from the draft's latest valid config. */
function WidgetEditor(props: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { manager } = useWidgetHost();
  // Reports arrive from the editor's bundle; apply each to the draft as it is then.
  const latest = useRef(props);
  latest.current = props;
  const { id, is } = props.draft.widget;
  // The editor owns its state once open, so it's given a config only when it mounts.
  const viewProps: EditorViewProps = useMemo(() => ({
    widgetId: id,
    config: draftConfig(latest.current.draft),
    reportDraft: (report: DraftReport) =>
      latest.current.onChange(withReport(latest.current.draft, report)),
  }), [id]);
  return (
    <MfeView
      manager={manager}
      mfe={is}
      view={editorViewName}
      props={viewProps}
      fallback={(message) => <WidgetProblem message={message} />}
    />
  );
}

/** Edits one widget's draft: its type's own settings (a heading among them, if it has one). */
export function WidgetForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  error: string | null;
}) {
  const { draft, onChange } = props;
  const { registry } = useWidgetHost();
  const permissionOf = usePermissions();
  const type = registeredTypes(registry).find((t) => t.id === draft.widget.is);
  const permissions = type?.permissions ?? null;
  const state = permissionOf(draft.widget.is, permissions);
  return (
    <Stack gap="4">
      {permissions !== null && (
        <PermissionNote
          state={state}
          onWithdraw={() => answer(draft.widget.is, permissions, false)}
        />
      )}
      {
        // Its settings form loads before consent too: it only edits the config, which is
        // saved to the layout. (The skills say a widget's editor never calls a service.)
      }
      <WidgetEditor draft={draft} onChange={onChange} />
      {props.error !== null && <Text color="fg.error" fontSize="sm">{props.error}</Text>}
    </Stack>
  );
}

export { Label };
