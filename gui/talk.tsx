// Talk: conversations with the people (robots) who hold each job. Checks: the factory's own commands, one button each.
import { useEffect, useRef, useState } from "react";
import { splitSuggestions, toolLine } from "../plugin/engine/state";
import { call } from "./data";
import { personaFor, Robot } from "./robots";
import { Select, Skel } from "./ui";

/** An action the conversation proposes. Only the button runs it: the session itself has no way to push or merge. */
export type Proposal = { kind: "push" | "merge" | "sync"; id?: string };
export type Msg = { who: "you" | "team"; text: string; suggestions?: string[]; tools?: string[]; cost?: number; bad?: boolean; proposal?: Proposal; acted?: string };
export type Chat = { messages: Msg[]; session?: string; busy: boolean };
export type Chats = Record<string, Chat>;
type Topic = { key: string; title: string; summary: string; first: string; available: boolean; reason?: string; role?: string; roleTitle?: string; suggest?: boolean; readOnly?: boolean };
type Reply = { ok: boolean; status: string; text: string; session?: string; costUsd?: number; denials: string[]; tools: { tool: string; input: unknown }[] };

const MODELS = [
  { value: "sonnet", label: "sonnet", hint: "Balanced. Good for most conversations" },
  { value: "opus", label: "opus", hint: "Deepest thinking. Slower and costs more" },
  { value: "fable", label: "fable", hint: "Most capable. Best for hard design questions" },
  { value: "haiku", label: "haiku", hint: "Fast and cheap. Good for quick checks" },
];
const EFFORTS = [
  { value: "low", label: "low", hint: "Quick answers" },
  { value: "medium", label: "medium", hint: "Balanced" },
  { value: "high", label: "high", hint: "Thorough, but slower" },
];
const FAILURES: Record<string, string> = {
  rate_limited: "The model is rate limited right now. Try again in a while, or pick another model above.",
  auth: "The Claude command line is not logged in. Run `claude` in a terminal, log in, then try again.",
};

type SendOpts = { key: string; message: string; shown?: string; chat: Chat; suggest: boolean; model: string; effort: string; setChats: React.Dispatch<React.SetStateAction<Chats>> };
/** One turn of a conversation: shows what you wrote, asks the server, and adds the reply with its suggestions and any action it proposes. Used by Talk and by the box in Checks. */
export async function sendChat(o: SendOpts) {
  const patch = (fn: (c: Chat) => Chat) => o.setChats((all) => ({ ...all, [o.key]: fn(all[o.key] ?? { messages: [], busy: false }) }));
  patch((c) => ({ ...c, busy: true, messages: [...c.messages, { who: "you", text: o.shown ?? o.message }] }));
  const r = await call<Reply>("/api/chat", { topic: o.key, message: o.message, session: o.chat.session, model: o.model, effort: o.effort, suggest: o.suggest });
  patch((c) => {
    if (!r.ok) return { ...c, busy: false, messages: [...c.messages, { who: "team", text: r.error, bad: true }] };
    const d = r.data;
    const split = d.ok ? splitSuggestions(d.text) : { text: d.text, suggestions: [] as string[] };
    const ask = d.ok ? /^PROPOSE: (push|merge|sync)(?: (F-\d+))?[ \t]*$/m.exec(split.text) : null;
    const proposal: Proposal | undefined = ask && (ask[1] === "sync" ? !ask[2] : !!ask[2]) ? { kind: ask[1] as Proposal["kind"], id: ask[2] } : undefined;
    const reply: Msg = d.ok
      ? { who: "team", text: proposal ? split.text.replace(ask![0], "").trimEnd() : split.text, suggestions: split.suggestions, proposal, tools: d.tools.map((t) => toolLine(t)), cost: d.costUsd }
      : { who: "team", text: FAILURES[d.status] ?? d.text, bad: true };
    if (d.denials.length) reply.tools = [...(reply.tools ?? []), ...d.denials.map((x) => `not allowed here: ${x}`)];
    return { ...c, busy: false, session: d.session ?? c.session, messages: [...c.messages, reply] };
  });
}

export function Talk({ chats, setChats, topic: wanted }: { chats: Chats; setChats: React.Dispatch<React.SetStateAction<Chats>>; topic: string }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { call<Topic[]>("/api/chat/topics").then((r) => (r.ok ? setTopics(r.data) : setProblem(r.error))); }, []);
  // "Talk to Mara" on the Team view opens her conversation; otherwise the first one that is available. The first only fills an empty choice, so reloading the list (after a switch) never moves you.
  useEffect(() => { if (topics) setKey((k) => k || topics.find((t) => t.available)?.key || ""); }, [topics]);
  useEffect(() => { if (topics && wanted && topics.some((t) => t.key === wanted && t.available)) setKey(wanted); }, [wanted, topics === null]);
  // The Guide only explains, so it starts on the cheap model; the choice above stays yours.
  useEffect(() => { if (topics?.find((t) => t.key === key)?.readOnly) setModel("haiku"); }, [key, topics === null]);
  const chat: Chat = chats[key] ?? { messages: [], busy: false };
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages.length, chat.busy]);

  const patch = (k: string, fn: (c: Chat) => Chat) => setChats((all) => ({ ...all, [k]: fn(all[k] ?? { messages: [], busy: false }) }));
  const send = (message: string) => {
    if (!message.trim() || chat.busy) return;
    setText("");
    sendChat({ key, message, chat, suggest: topics?.find((t) => t.key === key)?.suggest ?? false, model, effort, setChats });
  };

  // The approval: the button calls the same endpoint as the dashboard's Push and Merge buttons.
  const approve = async (i: number, p: Proposal) => {
    const k = key;
    patch(k, (c) => ({ ...c, busy: true }));
    const r = await call<{ ok: boolean; output: string }>(p.kind === "sync" ? "/api/sync" : `/api/${p.kind}`, p.kind === "sync" ? {} : { id: p.id });
    const text = r.ok ? r.data.output : r.error;
    patch(k, (c) => ({ ...c, busy: false, messages: [...c.messages.map((m, j) => (j === i ? { ...m, acted: r.ok ? "Done" : "Failed" } : m)), { who: "team", text, bad: !r.ok }] }));
  };

  if (!topics) return problem ? <p className="error" role="alert">{problem}</p> : (
    <div className="talk sk-view" aria-busy="true">
      <div className="topics">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="tile row gap"><Skel w={44} h={44} round /><div className="col grow"><Skel w="55%" h={14} /><Skel w="80%" h={12} /></div></div>)}</div>
      <section className="tile"><Skel w={200} h={20} /><div style={{ height: 320 }} /></section>
    </div>
  );
  const topic = topics.find((t) => t.key === key);
  const role = topic?.role ?? (topic?.readOnly ? topic.key : "");
  const person = personaFor(role);
  return (
    <div className="talk">
      <div className="topics" role="group" aria-label="Who to talk to">
        {topics.map((t) => (
          <button key={t.key} className="person" aria-current={t.key === key} disabled={!t.available} title={t.reason} onClick={() => setKey(t.key)}>
            <Robot role={t.role ?? t.key} size={44} status={chats[t.key]?.busy ? "working" : "free"} />
            <span className="text"><b>{t.role ?? (t.readOnly ? t.key : undefined) ? personaFor((t.role ?? t.key)).name : t.title} <span className="note">{t.roleTitle}</span></b><span className="note">{t.available ? t.title : t.reason}</span></span>
          </button>
        ))}
        <p className="note">Deploying stays on the command line, where every step waits for your yes.</p>
      </div>
      {topic && (
        <section className="tile chat" aria-label={`${topic.title} with ${person.name}`}>
          <header className="chat-head">
            <Robot role={role} size={56} status={chat.busy ? "working" : "free"} />
            <div className="grow">
              <h2>{person.name}</h2>
              <p className="note">{topic.roleTitle} · {chat.busy ? "Thinking…" : "Listening"}</p>
            </div>
            <label className="switch" title="End each reply with a few messages you could send next. They only send a message; they never do anything else."><input type="checkbox" role="switch" checked={!!topic.suggest} onChange={async (e) => { const on = e.target.checked; const r = await call("/api/chat/suggest", { topic: key, on }); if (r.ok) setTopics((ts) => ts && ts.map((t) => (t.role === topic.role ? { ...t, suggest: on } : t))); else setProblem(r.error); }} /><span>Suggest replies</span></label>
            <Select label="Model" prefix="Model" value={model} options={MODELS} onChange={setModel} align="right" />
            <Select label="Effort" prefix="Effort" value={effort} options={EFFORTS} onChange={setEffort} align="right" />
          </header>
          <div className="messages" role="log" aria-live="polite" aria-label={`${topic.title} conversation`}>
            {chat.messages.length === 0 && (
              <div className="intro">
                <div className="bubble team"><Robot role={role} size={34} /><div className="inner-card">Hi, I’m {person.name}, the {topic.roleTitle}. {topic.summary}{topic.readOnly ? "" : " I ask one question at a time and save nothing until you approve it."}</div></div>
                <button className="primary" onClick={() => send(topic.first)}>Start this conversation</button>
              </div>
            )}
            {chat.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.who}`}>
                {m.who === "team" && <Robot role={role} size={34} />}
                <div className={`inner-card${m.bad ? " bad" : ""}`}>
                  {m.text}
                  {(m.tools?.length || m.cost) ? (
                    <div className="msg-meta">
                      {m.tools?.map((t, j) => <span key={j}>{t}</span>)}
                      {m.cost ? <span>${m.cost.toFixed(4)}</span> : null}
                    </div>
                  ) : null}
                  {m.proposal && (
                    <div className="proposal">
                      <span>{m.proposal.kind === "sync" ? "Update from GitHub?" : `${m.proposal.kind === "push" ? "Push" : "Merge"} ${m.proposal.id}${m.proposal.kind === "push" ? " to GitHub and open a pull request?" : "'s pull request into main?"}`}</span>
                      {m.acted ? <b>{m.acted}</b> : <button className="primary" disabled={chat.busy} onClick={() => approve(i, m.proposal!)}>{m.proposal.kind === "sync" ? "Sync" : m.proposal.kind === "push" ? "Push" : "Merge"}</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!chat.busy && topic.suggest && (chat.messages.at(-1)?.suggestions?.length ?? 0) > 0 && (
              <div className="suggest" role="group" aria-label="Suggested replies">
                {chat.messages.at(-1)!.suggestions!.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {chat.busy && (
              <div className="bubble team" role="status" aria-label={`${person.name} is typing`}>
                <Robot role={role} size={34} status="working" />
                <div className="inner-card typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={end} />
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea
              aria-label="Your message" placeholder={chat.messages.length ? "Your answer…" : "Or type your first message here…"} value={text} disabled={chat.busy} maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            />
            <button className="primary" disabled={chat.busy || !text.trim()}>Send</button>
          </form>
          <p className="note">{topic.readOnly ? `${person.name} can read this project and run read-only checks. ${person.name} cannot change anything.` : `${person.name} can read this project and write documents under docs/. ${person.name} cannot change code.`}</p>
        </section>
      )}
    </div>
  );
}
