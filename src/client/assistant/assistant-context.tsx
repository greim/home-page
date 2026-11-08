/**
 * The assistant's conversation, kept as long as the page: a turn carries on (and
 * applies its layout) while the assistant isn't open. Its own provider, so streamed
 * text re-renders only the panel, not the whole page.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Layout } from "../../common/model.ts";
import { AssistantPanel } from "./assistant-panel.tsx";
import { makeConversations } from "./conversations.ts";
import { type Assistant, browserChatStorage, makeUseAssistant } from "./use-assistant.ts";

const conversations = makeConversations(browserChatStorage);
const conversationId = "window";

const AssistantContext = createContext<Assistant | null>(null);

export function AssistantProvider(props: {
  onApplied: (layout: Layout) => void;
  children: ReactNode;
}) {
  const { onApplied } = props;
  const useAssistant = useMemo(() => makeUseAssistant(conversations, onApplied), [onApplied]);
  const assistant = useAssistant(conversationId);
  return <AssistantContext.Provider value={assistant}>{props.children}</AssistantContext.Provider>;
}

/** The assistant's panel, for its full-screen view. */
export function ConnectedAssistantPanel() {
  const assistant = useContext(AssistantContext);
  if (assistant === null) {
    throw new Error("ConnectedAssistantPanel must be used within AssistantProvider");
  }
  return <AssistantPanel assistant={assistant} />;
}
