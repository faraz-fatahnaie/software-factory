// Conversations are kept by the server, on disk in the project (see plugin/engine/chatlog.ts): the page shows what the server holds.
// This file brings them into the page, and hands over what an earlier version kept in the browser, once.
import type { Stored } from "../plugin/engine/chatlog";
import { call } from "./data";
import type { Chat, Chats } from "./talk";

const LEGACY = "factory-chat:";

/** A conversation as the server holds it, laid over what the page has: the unsent draft, waiting files and picture previews are the page's own and stay. */
export function mirror(mine: Chat | undefined, kept: Stored & { busy?: boolean }): Chat {
  const before = mine?.messages ?? [];
  return {
    ...mine, session: kept.session, subs: kept.subs, busy: !!kept.busy, remote: !!kept.busy,
    messages: kept.messages.map((m, i) => (m.files && before[i]?.files ? { ...m, files: m.files.map((f, j) => (before[i]!.files![j]?.name === f.name ? { ...f, url: before[i]!.files![j]!.url } : f)) } : m)),
  };
}

/** Lays the server's conversations over the page's. A conversation this page is itself waiting on is left alone: its reply brings the new state. */
export const merge = (all: Chats, kept: Record<string, Stored & { busy?: boolean }>): Chats => {
  const out: Chats = { ...all };
  for (const [topic, c] of Object.entries(kept)) if (!all[topic]?.busy || all[topic]!.remote) out[topic] = mirror(all[topic], c);
  // Gone on the server (cleared elsewhere, or a reply this page was only watching ended with nothing kept): gone here too, but never what is being typed.
  for (const [topic, c] of Object.entries(all)) if (!(topic in kept) && (c.remote || (!c.busy && c.messages.length))) out[topic] = { ...c, messages: [], session: undefined, subs: undefined, busy: false, remote: false };
  return out;
};

/** Reads every conversation from the server. Before the first read, anything an earlier version kept in this browser is handed to the server (it only fills a conversation that is empty there) and removed. */
export async function fetchChats(): Promise<Record<string, Stored & { busy?: boolean }> | null> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY)) continue;
      const r = await call("/api/chats/import", { topic: key.slice(LEGACY.length), raw: localStorage.getItem(key) });
      if (r.ok || /topic:/.test(r.error)) localStorage.removeItem(key); // kept on disk now, or a conversation that no longer exists
    }
  } catch { /* storage blocked: nothing to hand over */ }
  const r = await call<Record<string, Stored & { busy?: boolean }>>("/api/chats");
  return r.ok ? r.data : null;
}
