/**
 * The assistant's conversations, one per assistant widget, by its id. They live
 * as long as the page, not their views, so a turn carries on while its widget
 * is collapsed or being edited, and they're saved so they survive reloads.
 */
import { type Chat, type ChatAction, chatReducer } from "./chat.ts";

const storagePrefix = "home-page.assistant-chat";

/** Where a widget's conversation is kept in browser storage. */
export const storageKey = (widgetId: string): string => `${storagePrefix}.widget.${widgetId}`;

export type ChatStorage = {
  readonly load: (key: string) => Chat;
  readonly save: (key: string, chat: Chat) => void;
};

export type Conversations = {
  readonly get: (widgetId: string) => Chat;
  readonly dispatch: (widgetId: string, action: ChatAction) => void;
  /** Calls `listener` after any conversation changes. Returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
};

export const makeConversations = (storage: ChatStorage): Conversations => {
  const chats = new Map<string, Chat>();
  const listeners = new Set<() => void>();

  const get = (widgetId: string): Chat => {
    const key = storageKey(widgetId);
    const chat = chats.get(key) ?? storage.load(key);
    chats.set(key, chat);
    return chat;
  };

  return {
    get,
    dispatch: (widgetId, action) => {
      const chat = chatReducer(get(widgetId), action);
      chats.set(storageKey(widgetId), chat);
      storage.save(storageKey(widgetId), chat);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
