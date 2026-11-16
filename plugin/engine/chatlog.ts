// What was said in each of the dashboard's conversations, kept on disk in the project (`.factory/chats/<topic>.json`, never committed),
// so it survives closing the dashboard, another browser or a change of port. The server writes it; the page shows what the server holds.
// Only text is kept: no file contents, and long command output is cut. Clearing a conversation deletes its file.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseProposal, splitSuggestions, type Context, type Proposal, type ToolStep } from "./state";

export type Shown = { name: string; size: number; url?: string };
export type Msg = { who: "you" | "team"; text: string; files?: Shown[]; suggestions?: string[]; tools?: ToolStep[]; cost?: number; bad?: boolean; proposal?: Proposal; acted?: string; /** Not a message: the line where the conversation was compacted. What is above it the model now holds as a summary. */ divider?: { before: number; after: number; at: string } };
/** One conversation as it is kept: the messages, and the Claude sessions it continues (its own, and for the manager one per role it consulted). */
export type Stored = { messages: Msg[]; session?: string; subs?: Record<string, string>; /** How full the context was after the last reply; for the manager, also that of each role's side conversation. */ context?: Context; contexts?: Record<string, Context> };

const VERSION = 1, MAX_MESSAGES = 200, MAX_CHARS = 300_000, MAX_OUTPUT = 2000;
const SESSION = /^[\w-]{8,64}$/, TOPIC = /^[a-z]{1,30}$/;
const file = (root: string, topic: string) => join(root, ".factory", "chats", `${topic}.json`);

const slim = (m: Msg): Msg => ({
  ...m,
  ...(m.files && { files: m.files.map(({ name, size }) => ({ name, size })) }), // a preview address means nothing outside the page that made it
  ...(m.tools && { tools: m.tools.map((t) => (t.output && t.output.length > MAX_OUTPUT ? { ...t, output: `${t.output.slice(0, MAX_OUTPUT)}\n… (cut)` } : t)) }),
});

/** What is kept of one conversation, as text. The oldest messages go first when it grows too large. */
export function pack(chat: Stored): string {
  let messages = chat.messages.slice(-MAX_MESSAGES).map(slim);
  const text = () => JSON.stringify({ v: VERSION, session: chat.session, subs: chat.subs, context: chat.context, contexts: chat.contexts, messages });
  while (messages.length > 1 && text().length > MAX_CHARS) messages = messages.slice(Math.ceil(messages.length / 4));
  return text();
}

/** Reads what `pack` wrote, or what a browser kept before conversations moved to disk. Anything else (an older shape, a damaged entry) is ignored, never trusted. */
export function unpack(raw: string | null): Stored | null {
  try {
    const d = JSON.parse(raw ?? "");
    if (d?.v !== VERSION || !Array.isArray(d.messages)) return null;
    const messages = d.messages.filter((m: any) => (m?.who === "you" || m?.who === "team") && typeof m.text === "string");
    const session = typeof d.session === "string" && SESSION.test(d.session) ? d.session : undefined;
    const subs = d.subs && typeof d.subs === "object" ? Object.fromEntries(Object.entries(d.subs).filter(([k, v]) => TOPIC.test(k) && typeof v === "string" && SESSION.test(v as string))) as Record<string, string> : undefined;
    const ctx = (c: any): Context | undefined => (Number.isFinite(c?.used) && Number.isFinite(c?.window) && c.used >= 0 && c.window > 0 ? { used: c.used, window: c.window } : undefined);
    const contexts = d.contexts && typeof d.contexts === "object" ? Object.fromEntries(Object.entries(d.contexts).flatMap(([k, v]) => (TOPIC.test(k) && ctx(v) ? [[k, ctx(v)!]] : []))) : undefined;
    return { messages, session, subs, ...(session && ctx(d.context) && { context: ctx(d.context) }), ...(contexts && Object.keys(contexts).length && { contexts }) };
  } catch { return null; }
}

/** A topic is a file name here, so it is checked before it is used as one. */
const safe = (topic: string) => { if (!TOPIC.test(topic)) throw new Error("topic: not a conversation"); return topic; };

export function readChat(root: string, topic: string): Stored {
  const f = file(root, safe(topic));
  return (existsSync(f) ? unpack(readFileSync(f, "utf8")) : null) ?? { messages: [] };
}

function write(root: string, topic: string, chat: Stored): Stored {
  mkdirSync(join(root, ".factory", "chats"), { recursive: true });
  writeFileSync(file(root, safe(topic)), pack(chat));
  return readChat(root, topic); // what is kept, after the cuts
}

/** Adds messages to a conversation, and records the sessions it now continues. */
export function appendChat(root: string, topic: string, messages: Msg[], sessions: { session?: string; subs?: Record<string, string>; context?: Context; contexts?: Record<string, Context> } = {}): Stored {
  const c = readChat(root, topic);
  // A turn that was stopped reports no context: what was measured last still describes the session.
  return write(root, topic, { messages: [...c.messages, ...messages], session: sessions.session ?? c.session, subs: sessions.subs ?? c.subs, context: sessions.context ?? c.context, contexts: { ...c.contexts, ...sessions.contexts } });
}

/** The conversation was compacted: a divider is added, and its context is now what the compaction left (the window is unchanged). */
export function markCompacted(root: string, topic: string, c: { before: number; after: number }, session?: string): Stored {
  const now = readChat(root, topic);
  return write(root, topic, { ...now, session: session ?? now.session, context: now.context ? { used: c.after, window: now.context.window } : undefined, messages: [...now.messages, { who: "team", text: "", divider: { ...c, at: new Date().toISOString() } }] });
}

/** A person pressed the button a reply proposed: the reply says how it went, and the outcome follows it as a message. */
export function markActed(root: string, topic: string, index: number, ok: boolean, text: string): Stored {
  const c = readChat(root, topic);
  if (!Number.isInteger(index) || !c.messages[index]?.proposal) throw new Error("index: not a message that proposed something");
  return write(root, topic, { ...c, messages: [...c.messages.map((m, i) => (i === index ? { ...m, acted: ok ? "Done" : "Failed" } : m)), { who: "team", text: text.slice(0, 20_000), bad: !ok }] });
}

/** Clears a conversation: its messages and its sessions are gone from disk. */
export const clearChat = (root: string, topic: string) => rmSync(file(root, safe(topic)), { force: true });

/** Takes over a conversation a browser kept before they moved to disk. Only into an empty one: what is on disk wins. */
export function importChat(root: string, topic: string, raw: unknown): Stored {
  const now = readChat(root, topic), old = unpack(typeof raw === "string" ? raw : null);
  return now.messages.length || !old?.messages.length ? now : write(root, topic, old);
}

const FAILURES: Record<string, string> = {
  rate_limited: "The model is rate limited right now. Try again in a while, or pick another model above.",
  auth: "The Claude command line is not logged in. Run `claude` in a terminal, log in, then try again.",
};
type Turn = { ok: boolean; status: string; text: string; costUsd?: number; denials?: string[]; tools?: ToolStep[]; executed?: { proposal: Proposal; ok: boolean; note: string } };
/** A reply as the page shows it: its text, the next messages it suggests, the action it proposes (or already carried out on autopilot), and what it ran. */
export function replyMsg(d: Turn): Msg {
  if (!d.ok) return { who: "team", text: FAILURES[d.status] ?? d.text, ...(d.status !== "stopped" && { bad: true }) }; // a stop the person asked for is not an error
  const split = splitSuggestions(d.text), { text, proposal } = parseProposal(split.text);
  const reply: Msg = { who: "team", text, suggestions: split.suggestions, proposal, tools: d.tools, cost: d.costUsd };
  // On autopilot the manager has already carried out what it proposed: the message says so, and there is no button.
  if (d.executed) { reply.proposal = d.executed.proposal; reply.acted = d.executed.ok ? "Done" : "Failed"; reply.text = `${reply.text}\n\n${d.executed.note}`.trim(); if (!d.executed.ok) reply.bad = true; }
  if (d.denials?.length) reply.tools = [...(reply.tools ?? []), ...d.denials.map((x) => ({ tool: "Not allowed", detail: x, error: true }))];
  return reply;
}
