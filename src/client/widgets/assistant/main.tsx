/**
 * The assistant widget: a chat with the admin assistant. Each widget keeps a
 * conversation of its own, and tells the page about each layout the assistant
 * applies on the "layout-applied" channel.
 */
import { Text } from "@chakra-ui/react";
import { useEffect } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import {
  type EditorProps,
  editorView,
  type WidgetProps,
  widgetView,
} from "../../widget-kit/views.tsx";
import { AssistantWidget, browserChatStorage, makeUseAssistant } from "./assistant.tsx";
import { AssistantConfig } from "./config.ts";
import { makeConversations } from "./conversations.ts";
import { layoutAppliedChannel } from "./protocol.ts";

registerMfe("assistant", (shell) => {
  const useAssistant = makeUseAssistant(
    makeConversations(browserChatStorage),
    (layout) => void shell.send({ channel: layoutAppliedChannel, message: layout }),
  );

  const Widget = ({ widgetId }: WidgetProps<AssistantConfig>) => (
    <AssistantWidget assistant={useAssistant(widgetId)} />
  );

  const Editor = ({ config, reportDraft }: EditorProps<AssistantConfig>) => {
    useEffect(() => reportDraft({ ok: true, config }), []);
    return (
      <Text fontSize="sm" color="fg.muted">
        A chat with the admin assistant, which can change your page and write new widgets. Each
        assistant widget keeps a conversation of its own.
      </Text>
    );
  };

  return {
    widget: widgetView(AssistantConfig, Widget),
    editor: editorView(AssistantConfig, Editor),
  };
});
