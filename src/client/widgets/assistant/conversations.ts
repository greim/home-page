/**
 * The assistant's conversations, one per place it's hosted (the admin bar's
 * panel and each assistant widget). They live as long as the page, not their
 * views, so a turn carries on while its panel is closed or its widget is
 * collapsed, and they're saved so they survive reloads.
 */
import { type Chat, type ChatAction, chatReducer } from "./chat.ts";

/** Which conversation: the admin bar's panel, or the assistant widget with this id. */
export type ChatHost = { readonly is: "panel" } | {
  readonly is: "widget";
  readonly widgetId: string;
};

const storagePrefix = "home-page.assistant-chat";

/** Where a conversation is kept in browser storage. */
export const storageKey = (host: ChatHost): string =>
  host.is === "panel" ? storagePrefix : `${storagePrefix}.widget.${host.widgetId}`;

export type ChatStorage = {
  readonly load: (key: string) => Chat;
  readonly save: (key: string, chat: Chat) => void;
};

export type Conversations = {
  readonly get: (host: ChatHost) => Chat;
  readonly dispatch: (host: ChatHost, action: ChatAction) => void;
  /** Calls `listener` after any conversation changes. Returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
};

export const makeConversations = (storage: ChatStorage): Conversations => {
  const chats = new Map<string, Chat>();
  const listeners = new Set<() => void>();

  const get = (host: ChatHost): Chat => {
    const key = storageKey(host);
    const chat = chats.get(key) ?? storage.load(key);
    chats.set(key, chat);
    return chat;
  };

  return {
    get,
    dispatch: (host, action) => {
      const chat = chatReducer(get(host), action);
      chats.set(storageKey(host), chat);
      storage.save(storageKey(host), chat);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
