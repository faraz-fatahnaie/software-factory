// Talk: conversations with the people (robots) who hold each job. Checks: the factory's own commands, one button each.
import { useEffect, useRef, useState } from "react";
import { toolLine } from "../plugin/engine/state";
import { call } from "./data";
import { personaFor, Robot } from "./robots";
import { Select, Skel } from "./ui";

export type Msg = { who: "you" | "team"; text: string; tools?: string[]; cost?: number; bad?: boolean };
export type Chat = { messages: Msg[]; session?: string; busy: boolean };
export type Chats = Record<string, Chat>;
type Topic = { key: string; title: string; summary: string; first: string; available: boolean; reason?: string; role?: string; roleTitle?: string };
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

export function Talk({ chats, setChats, topic: wanted }: { chats: Chats; setChats: React.Dispatch<React.SetStateAction<Chats>>; topic: string }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { call<Topic[]>("/api/chat/topics").then((r) => (r.ok ? setTopics(r.data) : setProblem(r.error))); }, []);
  // "Talk to Mara" on the Team view opens her conversation; otherwise the first one that is available.
  useEffect(() => { if (topics) setKey((k) => (wanted && topics.some((t) => t.key === wanted && t.available) ? wanted : k || topics.find((t) => t.available)?.key || "")); }, [topics, wanted]);
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

  if (!topics) return problem ? <p className="error" role="alert">{problem}</p> : (
    <div className="talk sk-view" aria-busy="true">
      <div className="topics">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="tile row gap"><Skel w={44} h={44} round /><div className="col grow"><Skel w="55%" h={14} /><Skel w="80%" h={12} /></div></div>)}</div>
      <section className="tile"><Skel w={200} h={20} /><div style={{ height: 320 }} /></section>
    </div>
  );
  const topic = topics.find((t) => t.key === key);
  const role = topic?.role ?? "";
  const person = personaFor(role);
  return (
    <div className="talk">
      <div className="topics" role="group" aria-label="Who to talk to">
        {topics.map((t) => (
          <button key={t.key} className="person" aria-current={t.key === key} disabled={!t.available} title={t.reason} onClick={() => setKey(t.key)}>
            <Robot role={t.role ?? t.key} size={44} status={chats[t.key]?.busy ? "working" : "free"} />
            <span className="text"><b>{t.role ? personaFor(t.role).name : t.title} <span className="note">{t.roleTitle}</span></b><span className="note">{t.available ? t.title : t.reason}</span></span>
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
            <Select label="Model" prefix="Model" value={model} options={MODELS} onChange={setModel} align="right" />
            <Select label="Effort" prefix="Effort" value={effort} options={EFFORTS} onChange={setEffort} align="right" />
          </header>
          <div className="messages" role="log" aria-live="polite" aria-label={`${topic.title} conversation`}>
            {chat.messages.length === 0 && (
              <div className="intro">
                <div className="bubble team"><Robot role={role} size={34} /><div className="inner-card">Hi, I’m {person.name}, the {topic.roleTitle}. {topic.summary} I ask one question at a time and save nothing until you approve it.</div></div>
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
                </div>
              </div>
            ))}
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
          <p className="note">{person.name} can read this project and write documents under docs/. {person.name} cannot change code.</p>
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
            {r?.busy && <Skel h={60} r={10} />}
            {r && !r.busy && <pre className="out" aria-label={`Output of ${c.title}`}>{r.output || "No output."}</pre>}
          </section>
        );
      })}
    </div>
  );
}
