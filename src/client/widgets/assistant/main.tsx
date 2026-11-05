/**
 * The assistant widget: a chat with the admin assistant. It also provides the
 * admin bar's panel, which the page embeds as this MFE's "panel" view. Both
 * share the conversations kept here, and tell the page about each layout the
 * assistant applies on the "layout-applied" channel.
 */
import { Text } from "@chakra-ui/react";
import { Either, Schema } from "effect";
import { useEffect } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import {
  customView,
  type EditorProps,
  editorView,
  type WidgetProps,
  widgetView,
} from "../../widget-kit/views.tsx";
import {
  AssistantPanel,
  AssistantWidget,
  browserChatStorage,
  makeUseAssistant,
} from "./assistant.tsx";
import { AssistantConfig } from "./config.ts";
import { makeConversations } from "./conversations.ts";
import { layoutAppliedChannel, PanelProps } from "./protocol.ts";

registerMfe("assistant", (shell) => {
  const useAssistant = makeUseAssistant(
    makeConversations(browserChatStorage),
    (layout) => void shell.send({ channel: layoutAppliedChannel, message: layout }),
  );

  const Widget = ({ widgetId }: WidgetProps<AssistantConfig>) => (
    <AssistantWidget assistant={useAssistant({ is: "widget", widgetId })} />
  );

  const Editor = ({ config, reportDraft }: EditorProps<AssistantConfig>) => {
    useEffect(() => reportDraft({ ok: true, config }), []);
    return (
      <Text fontSize="sm" color="fg.muted">
        A chat with the admin assistant, always on view. It's a conversation of its own, apart from
        the one in the admin bar.
      </Text>
    );
  };

  const Panel = ({ onClose }: PanelProps) => (
    <AssistantPanel assistant={useAssistant({ is: "panel" })} onClose={onClose} />
  );

  return {
    widget: widgetView(AssistantConfig, Widget),
    editor: editorView(AssistantConfig, Editor),
    panel: customView(
      (props) => Either.mapLeft(Schema.decodeUnknownEither(PanelProps)(props), (e) => e.message),
      Panel,
    ),
  };
});
