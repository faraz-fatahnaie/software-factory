// Conversations are kept in the browser, per project (each project's dashboard has its own address) and per conversation,
// so a reload does not lose them. Only text is kept: no file contents, no picture previews, and long command output is cut.
// Storage can be full or blocked; then the conversation simply lives in the page, as before.
import type { Chat, Chats, Msg } from "./talk";

const PREFIX = "factory-chat:", VERSION = 1, MAX_MESSAGES = 200, MAX_CHARS = 300_000, MAX_OUTPUT = 2000;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const slim = (m: Msg): Msg => ({
  ...m,
  ...(m.files && { files: m.files.map(({ name, size }) => ({ name, size })) }), // a preview address does not survive a reload
  ...(m.tools && { tools: m.tools.map((t) => (t.output && t.output.length > MAX_OUTPUT ? { ...t, output: `${t.output.slice(0, MAX_OUTPUT)}\n… (cut)` } : t)) }),
});

/** What is kept of one conversation, as text. null when there is nothing to keep. The oldest messages go first when it grows too large. */
export function pack(chat: Chat): string | null {
  if (!chat.messages.length && !chat.session) return null;
  let messages = chat.messages.slice(-MAX_MESSAGES).map(slim);
  const text = () => JSON.stringify({ v: VERSION, session: chat.session, subs: chat.subs, messages });
  while (messages.length > 1 && text().length > MAX_CHARS) messages = messages.slice(Math.ceil(messages.length / 4));
  return text();
}

/** Reads what `pack` wrote. Anything else (an older shape, a damaged entry) is ignored, never trusted. */
export function unpack(raw: string | null): Chat | null {
  try {
    const d = JSON.parse(raw ?? "");
    if (d?.v !== VERSION || !Array.isArray(d.messages)) return null;
    const messages = d.messages.filter((m: any) => (m?.who === "you" || m?.who === "team") && typeof m.text === "string");
    const session = typeof d.session === "string" && /^[\w-]{8,64}$/.test(d.session) ? d.session : undefined;
    const subs = d.subs && typeof d.subs === "object" ? Object.fromEntries(Object.entries(d.subs).filter(([, v]) => typeof v === "string" && /^[\w-]{8,64}$/.test(v as string))) as Record<string, string> : undefined;
    return { messages, session, subs, busy: false };
  } catch { return null; }
}

const storage = (): Store | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function loadChats(store: Store | null = storage()): Chats {
  const out: Chats = {};
  try {
    for (let i = 0; store && i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const chat = unpack(store.getItem(key));
      if (chat) out[key.slice(PREFIX.length)] = chat;
    }
  } catch { /* blocked storage: start empty */ }
  return out;
}

export function saveChats(chats: Chats, store: Store | null = storage()): void {
  for (const [topic, chat] of Object.entries(chats)) {
    try {
      const text = pack(chat);
      if (text) store?.setItem(PREFIX + topic, text); else store?.removeItem(PREFIX + topic);
    } catch { /* full or blocked: the page still holds it */ }
  }
}

/** Changes whenever something worth saving changed (a message, a session, an answered proposal), but not on every key typed. */
export const signature = (chats: Chats) => Object.entries(chats).map(([k, c]) => `${k}:${c.messages.length}:${c.session ?? ""}:${c.messages.at(-1)?.acted ?? ""}`).join("|");
