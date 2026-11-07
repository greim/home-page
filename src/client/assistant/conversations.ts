/**
 * The assistant's conversations by id (the assistant window's is "window"). They
 * live as long as the page, not their views, so a turn carries on while its view
 * is closed, and they're saved so they survive reloads.
 */
import { type Chat, type ChatAction, chatReducer } from "./chat.ts";

/** Where a conversation is kept in browser storage. */
export const storageKey = (id: string): string => `home-page.assistant-chat.${id}`;

export type ChatStorage = {
  readonly load: (key: string) => Chat;
  readonly save: (key: string, chat: Chat) => void;
};

export type Conversations = {
  readonly get: (id: string) => Chat;
  readonly dispatch: (id: string, action: ChatAction) => void;
  /** Calls `listener` after any conversation changes. Returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
};

export const makeConversations = (storage: ChatStorage): Conversations => {
  const chats = new Map<string, Chat>();
  const listeners = new Set<() => void>();

  const get = (id: string): Chat => {
    const chat = chats.get(id) ?? storage.load(storageKey(id));
    chats.set(id, chat);
    return chat;
  };

  return {
    get,
    dispatch: (id, action) => {
      const chat = chatReducer(get(id), action);
      chats.set(id, chat);
      storage.save(storageKey(id), chat);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
