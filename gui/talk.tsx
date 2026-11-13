// Talk: conversations with the roles that work with you. Checks: the factory's own commands, one button each.
import { useEffect, useRef, useState } from "react";
import { toolLine } from "../plugin/engine/state";
import { call } from "./data";

export type Msg = { who: "you" | "team"; text: string; tools?: string[]; cost?: number; bad?: boolean };
export type Chat = { messages: Msg[]; session?: string; busy: boolean };
export type Chats = Record<string, Chat>;
type Topic = { key: string; title: string; summary: string; first: string; available: boolean; reason?: string };
type Reply = { ok: boolean; status: string; text: string; session?: string; costUsd?: number; denials: string[]; tools: { tool: string; input: unknown }[] };

const MODELS = ["sonnet", "opus", "fable", "haiku"], EFFORTS = ["low", "medium", "high"];
const FAILURES: Record<string, string> = {
  rate_limited: "The model is rate limited right now. Try again in a while, or pick another model above.",
  auth: "The Claude command line is not logged in. Run `claude` in a terminal, log in, then try again.",
};

export function Talk({ chats, setChats }: { chats: Chats; setChats: React.Dispatch<React.SetStateAction<Chats>> }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { call<Topic[]>("/api/chat/topics").then((r) => (r.ok ? (setTopics(r.data), setKey((k) => k || r.data.find((t) => t.available)?.key || "")) : setProblem(r.error))); }, []);
  const chat: Chat = chats[key] ?? { messages: [], busy: false };
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages.length, chat.busy]);

  const patch = (k: string, fn: (c: Chat) => Chat) => setChats((all) => ({ ...all, [k]: fn(all[k] ?? { messages: [], busy: false }) }));
  const send = async (message: string) => {
    const k = key, session = chat.session;
    if (!message.trim() || chat.busy) return;
    setText("");
    patch(k, (c) => ({ ...c, busy: true, messages: [...c.messages, { who: "you", text: message }] }));
    const r = await call<Reply>("/api/chat", { topic: k, message, session, model, effort });
    patch(k, (c) => {
      if (!r.ok) return { ...c, busy: false, messages: [...c.messages, { who: "team", text: r.error, bad: true }] };
      const d = r.data;
      const reply: Msg = d.ok
        ? { who: "team", text: d.text, tools: d.tools.map((t) => toolLine(t)), cost: d.costUsd }
        : { who: "team", text: FAILURES[d.status] ?? d.text, bad: true };
      if (d.denials.length) reply.tools = [...(reply.tools ?? []), ...d.denials.map((x) => `not allowed here: ${x}`)];
      return { ...c, busy: false, session: d.session ?? c.session, messages: [...c.messages, reply] };
    });
  };

  if (!topics) return <p className="empty">{problem || "Loading…"}</p>;
  const topic = topics.find((t) => t.key === key);
  return (
    <div className="talk">
      <div className="topics" role="group" aria-label="Conversations">
        {topics.map((t) => (
          <button key={t.key} className="topic" aria-current={t.key === key} disabled={!t.available} title={t.reason} onClick={() => setKey(t.key)}>
            <b>{t.title}</b>
            <span>{t.available ? t.summary : t.reason}</span>
          </button>
        ))}
        <p className="note">Deploying stays on the command line, where every step waits for your yes.</p>
      </div>
      {topic && (
        <section className="tile chat" aria-label={topic.title}>
          <div className="settings">
            <label>Model <select value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label>Effort <select value={effort} onChange={(e) => setEffort(e.target.value)}>{EFFORTS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <span>Can read this project and write documents under docs/. It cannot change code.</span>
          </div>
          <div className="messages" role="log" aria-live="polite" aria-label={`${topic.title} conversation`}>
            {chat.messages.length === 0 && (
              <div>
                <p className="empty">{topic.summary} It asks one question at a time and saves nothing until you approve it.</p>
                <button className="primary" onClick={() => send(topic.first)}>Start this conversation</button>
              </div>
            )}
            {chat.messages.map((m, i) => (
              <div key={i} className={m.who === "you" ? "msg-you" : `msg-team${m.bad ? " bad" : ""}`}>
                {m.text}
                {(m.tools?.length || m.cost) ? (
                  <div className="msg-meta">
                    {m.tools?.map((t, j) => <span key={j}>{t}</span>)}
                    {m.cost ? <span>${m.cost.toFixed(4)}</span> : null}
                  </div>
                ) : null}
              </div>
            ))}
            {chat.busy && <p className="working" role="status">Working on it. A reply can take a minute.</p>}
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
        </section>
      )}
    </div>
  );
}

const CHECKS: { name: string; title: string; about: string; writes?: boolean }[] = [
  { name: "doctor", title: "Is the setup right?", about: "Checks the config, role files, rules and skills, and lists anything missing." },
  { name: "status", title: "Where is everything?", about: "The same summary as the command line: each task and the stage it has reached." },
  { name: "release-info", title: "What would a release contain?", about: "The last tag, the changes since, and every file that carries the version." },
  { name: "release-check", title: "Is it ready to release?", about: "Blockers and warnings before you release. It never deploys or pushes." },
  { name: "scan", title: "Any secrets in the files?", about: "Looks for passwords and keys in what git tracks. Values are never printed." },
  { name: "team-apply", title: "Rebuild the role files", about: "Regenerates the role files from the team and commits them. Your own edits are kept.", writes: true },
];

type Result = { ok: boolean; output: string; busy?: boolean };

export function Checks() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const run = async (name: string) => {
    setResults((r) => ({ ...r, [name]: { ok: true, output: "", busy: true } }));
    const res = await call<{ ok: boolean; output: string }>("/api/command", { name });
    // A check that finds problems exits non-zero; its output is still the answer, so it is shown, not treated as a failure of the page.
    const done: Result = res.ok ? { ok: res.data.ok, output: res.data.output } : { ok: false, output: res.error };
    setResults((r) => ({ ...r, [name]: done }));
  };
  return (
    <div className="checks">
      {CHECKS.map((c) => {
        const r = results[c.name];
        return (
          <section key={c.name} className="tile check" aria-label={c.title}>
            <h3>{c.title}</h3>
            <p>{c.about}</p>
            <div className="row">
              <button className={r ? "" : "primary"} onClick={() => run(c.name)} disabled={r?.busy}>{r?.busy ? "Running…" : r ? "Run again" : "Run"}</button>
              {c.writes && <span className="tag">changes files</span>}
              {r && !r.busy && <span className={`badge ${r.ok ? "ok" : "warn"}`}>{r.ok ? "✓ Passed" : "⚠ Found problems"}</span>}
            </div>
            {r && !r.busy && <pre className="out" aria-label={`Output of ${c.title}`}>{r.output || "No output."}</pre>}
          </section>
        );
      })}
    </div>
  );
}
