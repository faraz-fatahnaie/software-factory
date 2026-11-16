// Talk: conversations with the people (robots) who hold each job. Checks: the factory's own commands, one button each.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ATTACH_EXT, ATTACH_MAX_BYTES, ATTACH_MAX_FILES, parseProposal, splitSuggestions, stepsSummary, type Proposal, type ToolStep } from "../plugin/engine/state";
import { call } from "./data";
import { Icon } from "./icons";
import { Markdown } from "./markdown";
import { AUTONOMY_OPTIONS, useManager, type Autonomy } from "./manager";
import { personaFor, Robot } from "./robots";
import { Select, Skel } from "./ui";

export type Shown = { name: string; size: number; url?: string };
export type Msg = { who: "you" | "team"; text: string; files?: Shown[]; suggestions?: string[]; tools?: ToolStep[]; cost?: number; bad?: boolean; proposal?: Proposal; acted?: string };
/** A file waiting to be sent with the next message. Pictures get a preview. */
export type Pending = { file: File; url?: string };
/** One conversation. The unsent message, the files waiting to go with it and a message queued behind a reply live here, not in the Talk page, so leaving the page and coming back loses nothing. */
export type Chat = { messages: Msg[]; session?: string; subs?: Record<string, string>; busy: boolean; draft?: string; files?: Pending[]; queued?: { message: string; files: Pending[] }; opts?: { suggest: boolean; model: string; effort: string } };
const draftKey = (k: string) => `factory-draft:${k}`;
/** The unsent message of a conversation, kept in the browser too, so a reload keeps it. Storage can be blocked: then it only lives in the page. */
const savedDraft = (k: string) => { try { return localStorage.getItem(draftKey(k)) ?? ""; } catch { return ""; } };
const saveDraft = (k: string, v: string) => { try { if (v) localStorage.setItem(draftKey(k), v); else localStorage.removeItem(draftKey(k)); } catch { /* the page still holds it */ } };

/** Sends what was queued behind a reply, once that reply is done. Runs in the app, so it works even if Talk is not on screen. */
export function useQueueDrain(chats: Chats, setChats: React.Dispatch<React.SetStateAction<Chats>>) {
  useEffect(() => {
    for (const [key, c] of Object.entries(chats)) {
      if (!c.queued || c.busy || !c.opts) continue;
      const q = c.queued;
      setChats((all) => ({ ...all, [key]: { ...all[key]!, queued: undefined } }));
      sendChat({ key, message: q.message, files: q.files, chat: c, ...c.opts, setChats });
    }
  }, [chats]);
}
export type Chats = Record<string, Chat>;
type Topic = { key: string; title: string; summary: string; first: string; available: boolean; reason?: string; role?: string; roleTitle?: string; suggest?: boolean; readOnly?: boolean; manager?: boolean };
type Reply = { ok: boolean; status: string; text: string; session?: string; sessions?: Record<string, string>; executed?: { proposal: Proposal; ok: boolean; note: string }; costUsd?: number; denials: string[]; tools: ToolStep[] };

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

const PROPOSAL_BUTTON: Record<Proposal["kind"], string> = { push: "Push", batch: "Push together", merge: "Merge", sync: "Sync", promote: "Promote", run: "Run", retry: "Retry" };
const PROPOSAL_ASK: Record<Proposal["kind"], (ids: string[]) => string> = {
  push: (ids) => (ids.length === 1 ? `Push ${ids[0]} to GitHub and open a pull request?` : `Push ${ids.join(", ")} to GitHub and open ${ids.length} pull requests?`),
  batch: (ids) => `Push ${ids.join(", ")} together, as one pull request?`,
  merge: (ids) => (ids.length === 1 ? `Merge ${ids[0]}'s pull request into main?` : `Merge the pull requests of ${ids.join(", ")} into main, in that order?`), sync: () => "Update from GitHub?",
  promote: (ids) => `Move ${ids.join(", ")} to Ready, in that order?`, run: (ids) => `Run ${ids.join(", ")} now?`, retry: (ids) => `Try ${ids.join(", ")} again?`,
};
const toBase64 = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.onerror = () => no(r.error); r.readAsDataURL(f); });
const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isImage = (name: string) => ["png", "jpg", "jpeg", "gif", "webp"].includes(ext(name));
const sizeOf = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const ACCEPT = ATTACH_EXT.map((e) => `.${e}`).join(",");

/** What is attached: a picture shows itself, anything else shows a file icon, its name and its size. */
function FileChip({ f, onRemove }: { f: Shown; onRemove?: () => void }) {
  const img = isImage(f.name) && f.url;
  return (
    <li className={`chip-file${img ? " pic" : ""}`}>
      {img ? <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name}`}><img src={f.url} alt={f.name} /></a> : <span className="ico"><Icon name={ext(f.name) === "pdf" ? "filetext" : isImage(f.name) ? "image" : ["md", "txt", "log", "csv", "tsv"].includes(ext(f.name)) ? "filetext" : "code"} size={20} /></span>}
      <span className="meta"><b title={f.name}>{f.name}</b><span>{ext(f.name).toUpperCase()} · {sizeOf(f.size)}</span></span>
      {onRemove && <button type="button" className="quiet x" onClick={onRemove} aria-label={`Remove ${f.name}`}><Icon name="x" size={14} /></button>}
    </li>
  );
}

/** What a reply did, folded into one line ("Ran 2 commands") that opens to each step, and each step opens to what came back. */
function Steps({ steps }: { steps: ToolStep[] }) {
  return (
    <details className="run-steps">
      <summary><Icon name="terminal" size={14} /><span>{stepsSummary(steps)}</span><Icon name="chevron" size={14} /></summary>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>
            <details className={s.error ? "run-step bad" : "run-step"}>
              <summary><b>{s.tool}</b><span title={s.detail}>{s.detail.replace(/\s+/g, " ").slice(0, 140)}</span><Icon name="chevron" size={12} /></summary>
              <pre className={s.tool.startsWith("Asked ") ? "cmd ask" : "cmd"} dir={s.tool.startsWith("Asked ") ? "auto" : "ltr"}>{s.detail}</pre>
              {s.output ? <pre className="out" dir="auto">{s.output}</pre> : <p className="note">{s.error ? "No output." : "Nothing came back."}</p>}
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}

type SendOpts = { key: string; message: string; shown?: string; files?: Pending[]; chat: Chat; suggest: boolean; model: string; effort: string; setChats: React.Dispatch<React.SetStateAction<Chats>> };
/** One turn of a conversation: shows what you wrote, asks the server, and adds the reply with its suggestions and any action it proposes. Used by Talk and by the box in Checks. */
export async function sendChat(o: SendOpts) {
  const patch = (fn: (c: Chat) => Chat) => o.setChats((all) => ({ ...all, [o.key]: fn(all[o.key] ?? { messages: [], busy: false }) }));
  const files = o.files ?? [];
  patch((c) => ({ ...c, busy: true, messages: [...c.messages, { who: "you", text: o.shown ?? o.message, files: files.length ? files.map((f) => ({ name: f.file.name, size: f.file.size, url: f.url })) : undefined }] }));
  let attachments: { name: string; data: string }[];
  try { attachments = await Promise.all(files.map(async (f) => ({ name: f.file.name, data: await toBase64(f.file) }))); }
  catch { return patch((c) => ({ ...c, busy: false, messages: [...c.messages, { who: "team", text: "A file could not be read. Attach it again.", bad: true }] })); }
  const r = await call<Reply>("/api/chat", { topic: o.key, message: o.message, session: o.chat.session, subs: o.chat.subs, model: o.model, effort: o.effort, suggest: o.suggest, ...(attachments.length && { attachments }) });
  patch((c) => {
    if (!r.ok) return { ...c, busy: false, messages: [...c.messages, { who: "team", text: r.error, bad: true }] };
    const d = r.data;
    const split = d.ok ? splitSuggestions(d.text) : { text: d.text, suggestions: [] as string[] };
    const { text: shown, proposal } = d.ok ? parseProposal(split.text) : { text: split.text, proposal: undefined };
    const reply: Msg = d.ok
      ? { who: "team", text: shown, suggestions: split.suggestions, proposal, tools: d.tools, cost: d.costUsd }
      : { who: "team", text: FAILURES[d.status] ?? d.text, bad: d.status !== "stopped" }; // a stop the person asked for is not an error
    // On autopilot the manager has already carried out what it proposed: the message says so, and there is no button.
    if (d.ok && d.executed) { reply.proposal = d.executed.proposal; reply.acted = d.executed.ok ? "Done" : "Failed"; reply.text = `${reply.text}\n\n${d.executed.note}`.trim(); reply.bad = !d.executed.ok; }
    if (d.denials.length) reply.tools = [...(reply.tools ?? []), ...d.denials.map((x) => ({ tool: "Not allowed", detail: x, error: true }))];
    return { ...c, busy: false, session: d.session ?? c.session, subs: d.sessions ?? c.subs, messages: [...c.messages, reply] };
  });
}

export function Talk({ chats, setChats, topic: wanted }: { chats: Chats; setChats: React.Dispatch<React.SetStateAction<Chats>>; topic: string }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState("medium");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [clearing, setClearing] = useState(false);
  useEffect(() => setClearing(false), [key]);
  const [dragging, setDragging] = useState(false);
  const { info: manager, set: setManager, problem: managerProblem } = useManager([]);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  useEffect(() => { call<Topic[]>("/api/chat/topics").then((r) => (r.ok ? setTopics(r.data) : setProblem(r.error))); }, []);
  // "Talk to Mara" on the Team view opens her conversation; otherwise the first one that is available. The first only fills an empty choice, so reloading the list (after a switch) never moves you.
  useEffect(() => { if (topics) setKey((k) => k || topics.find((t) => t.available)?.key || ""); }, [topics]);
  useEffect(() => { if (topics && wanted && topics.some((t) => t.key === wanted && t.available)) setKey(wanted); }, [wanted, topics === null]);
  // The Guide only explains, so it starts on the cheap model; the choice above stays yours.
  useEffect(() => { if (topics?.find((t) => t.key === key)?.readOnly) setModel("haiku"); }, [key, topics === null]);
  const chat: Chat = chats[key] ?? { messages: [], busy: false };
  const patch = (k: string, fn: (c: Chat) => Chat) => setChats((all) => ({ ...all, [k]: fn(all[k] ?? { messages: [], busy: false }) }));
  const text = chat.draft ?? (key ? savedDraft(key) : "");
  const pending = chat.files ?? [];
  const setText = (v: string) => { patch(key, (c) => ({ ...c, draft: v })); saveDraft(key, v); };
  const setPending = (f: Pending[] | ((p: Pending[]) => Pending[])) => patch(key, (c) => ({ ...c, files: typeof f === "function" ? f(c.files ?? []) : f }));
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages.length, chat.busy]);

  // The message box grows with what is typed or pasted, up to a limit (see .composer-box textarea), then scrolls.
  useLayoutEffect(() => { const t = box.current; if (!t) return; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }, [text, key, topics === null]);

  /** Adds files from the picker, a drop or a paste. Each one that cannot be sent says why, so nothing disappears silently. */
  const attach = (list: File[]) => {
    const keep: Pending[] = [], skipped: string[] = [];
    for (const file of list) {
      if (!ATTACH_EXT.includes(ext(file.name))) skipped.push(`${file.name || "A file"} is not a type that can be shown here (pictures, PDF, notebooks, text and code)`);
      else if (file.size > ATTACH_MAX_BYTES) skipped.push(`${file.name} is over 20 MB`);
      else if (pending.length + keep.length >= ATTACH_MAX_FILES) skipped.push(`${file.name} was left out: at most ${ATTACH_MAX_FILES} files per message`);
      else keep.push({ file, url: isImage(file.name) ? URL.createObjectURL(file) : undefined });
    }
    if (keep.length) setPending((p) => [...p, ...keep]);
    setNotice(skipped.join(". "));
  };
  const detach = (i: number) => setPending((p) => { if (p[i]?.url) URL.revokeObjectURL(p[i]!.url!); return p.filter((_, j) => j !== i); });
  const dropping = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  // Typing and sending stay open while a reply is on its way: a message sent meanwhile waits (one per conversation) and goes out when the reply is done.
  const opts = { suggest: topics?.find((t) => t.key === key)?.suggest ?? false, model, effort };
  const send = (message: string) => {
    if (!message.trim() && !pending.length) return;
    const files = pending;
    setText(""); setPending([]); setNotice("");
    if (chat.busy) patch(key, (c) => ({ ...c, opts, queued: { message: c.queued ? `${c.queued.message}\n\n${message}`.trim() : message, files: [...(c.queued?.files ?? []), ...files].slice(0, ATTACH_MAX_FILES) } }));
    else sendChat({ key, message, files, chat, ...opts, setChats });
  };

  /** Ends the reply that is coming (and what the manager asked others for), and drops a message that was waiting behind it. */
  const stop = async () => { patch(key, (c) => ({ ...c, queued: undefined })); await call("/api/chat/stop", { topic: key }); };

  // The approval: the button calls the same endpoints as the dashboard's own buttons.
  const approve = async (i: number, p: Proposal) => {
    const k = key;
    patch(k, (c) => ({ ...c, busy: true }));
    let r: Awaited<ReturnType<typeof call<{ output?: string }>>>, text = "";
    if (p.kind === "promote") { // one at a time, in the order given; the first that fails stops the rest
      r = { ok: true, data: {} };
      for (const id of p.ids) { r = await call("/api/promote", { id }); if (!r.ok) break; }
      text = r.ok ? `Moved ${p.ids.join(", ")} to Ready.` : r.error;
    } else if (p.kind === "run" || p.kind === "retry") {
      r = await call("/api/run", { ids: p.ids });
      text = r.ok ? `Started ${p.ids.join(", ")}. Follow it in Backlog.` : r.error;
    } else if (p.kind === "sync") {
      r = await call("/api/sync", {});
      text = r.ok ? r.data.output ?? "Done." : r.error;
    } else if (p.kind === "batch") {
      r = await call("/api/push-together", { ids: p.ids });
      text = r.ok ? r.data.output ?? "Done." : r.error;
    } else { // push or merge, one task at a time in the order given; the first that fails stops the rest and says why
      r = { ok: true, data: {} };
      const done: string[] = [];
      for (const id of p.ids) { r = await call(`/api/${p.kind}`, { id }); if (!r.ok) break; done.push(r.data.output ?? `${id}: done`); }
      text = r.ok ? done.join("\n\n") : `${done.length ? `${done.join("\n\n")}\n\n` : ""}${r.error}`;
    }
    const ok = r.ok;
    patch(k, (c) => ({ ...c, busy: false, messages: [...c.messages.map((m, j) => (j === i ? { ...m, acted: ok ? "Done" : "Failed" } : m)), { who: "team", text, bad: !ok }] }));
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
        <section
          className={`tile chat${dragging ? " dropping" : ""}`} aria-label={`${topic.title} with ${person.name}`}
          onDragEnter={(e) => { if (dropping(e)) { e.preventDefault(); depth.current++; setDragging(true); } }}
          onDragOver={(e) => { if (dropping(e)) e.preventDefault(); }}
          onDragLeave={(e) => { if (dropping(e) && --depth.current <= 0) { depth.current = 0; setDragging(false); } }}
          onDrop={(e) => { if (!dropping(e)) return; e.preventDefault(); depth.current = 0; setDragging(false); attach([...e.dataTransfer.files]); box.current?.focus(); }}
        >
          {dragging && <div className="drop-hint" aria-hidden="true"><Icon name="upload" size={28} /><b>Drop to attach</b><span>Pictures, PDFs, notebooks, text and code</span></div>}
          <header className="chat-head">
            <Robot role={role} size={56} status={chat.busy ? "working" : "free"} />
            <div className="grow">
              <h2>{person.name}</h2>
              <p className="note">{topic.roleTitle} · {chat.busy ? "Thinking…" : "Listening"}</p>
            </div>
            {chat.messages.length > 0 && (clearing
              ? <span className="row gap-s" role="group" aria-label="Start a new conversation?"><span className="note">Clear this conversation?</span><button className="small" onClick={async () => { setClearing(false); if (chat.busy) await stop(); patch(key, () => ({ messages: [], busy: false })); }}>Yes, start over</button><button className="small quiet" onClick={() => setClearing(false)}>Keep it</button></span>
              : <button className="small quiet" onClick={() => setClearing(true)} title="Clears the messages here and starts fresh. Documents the conversation wrote are kept.">New conversation</button>)}
            <label className="switch" title="End each reply with a few messages you could send next. They only send a message; they never do anything else."><input type="checkbox" role="switch" checked={!!topic.suggest} onChange={async (e) => { const on = e.target.checked; const r = await call("/api/chat/suggest", { topic: key, on }); if (r.ok) setTopics((ts) => ts && ts.map((t) => (t.role === topic.role ? { ...t, suggest: on } : t))); else setProblem(r.error); }} /><span>Suggest replies</span></label>
            {topic.manager && manager && <Select label="Autonomy" prefix="Manager" value={manager.settings.autonomy} options={AUTONOMY_OPTIONS} align="right" onChange={(v) => setManager({ autonomy: v as Autonomy })} />}
            <Select label="Model" prefix="Model" value={model} options={MODELS} onChange={setModel} align="right" />
            <Select label="Effort" prefix="Effort" value={effort} options={EFFORTS} onChange={setEffort} align="right" />
          </header>
          <div className="messages" role="log" aria-live="polite" aria-label={`${topic.title} conversation`}>
            {chat.messages.length === 0 && (
              <div className="intro">
                <div className="bubble team"><Robot role={role} size={34} /><div className="inner-card">Hi, I’m {person.name}, the {topic.roleTitle}. {topic.summary}{topic.readOnly || topic.manager ? "" : " I ask one question at a time and save nothing until you approve it."}</div></div>
                <button className="primary" onClick={() => send(topic.first)}>Start this conversation</button>
              </div>
            )}
            {chat.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.who}`}>
                {m.who === "team" && <Robot role={role} size={34} />}
                <div className={`inner-card${m.bad ? " bad" : ""}`}>
                  {m.tools?.length ? <Steps steps={m.tools} /> : null}
                  {m.files?.length ? <ul className="files">{m.files.map((f, j) => <FileChip key={j} f={f} />)}</ul> : null}
                  {m.who === "team" && !m.bad ? <Markdown text={m.text} /> : <div dir="auto">{m.text}</div>}
                  {m.cost ? <div className="msg-meta"><span>${m.cost.toFixed(4)}</span></div> : null}
                  {m.proposal && (
                    <div className="proposal">
                      <span>{PROPOSAL_ASK[m.proposal.kind](m.proposal.ids)}</span>
                      {m.acted ? <b>{m.acted}</b> : <button className="primary" disabled={chat.busy} onClick={() => approve(i, m.proposal!)}>{PROPOSAL_BUTTON[m.proposal.kind]}</button>}
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
          <form className="composer-box" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            {chat.queued && <p className="queued" role="status"><span>Waiting to send: {chat.queued.message.slice(0, 80) || "attached files"}</span><button type="button" className="quiet" onClick={() => patch(key, (c) => ({ ...c, queued: undefined }))}>Cancel</button></p>}
            {pending.length > 0 && <ul className="files tray" aria-label="Attached files">{pending.map((p, j) => <FileChip key={j} f={{ name: p.file.name, size: p.file.size, url: p.url }} onRemove={() => detach(j)} />)}</ul>}
            <textarea
              ref={box} rows={1} dir="auto" aria-label="Your message" placeholder={chat.messages.length ? "Your answer…" : "Or type your first message here…"} value={text} maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } else if (e.key === "Escape" && chat.busy && !text) stop(); }}
              onPaste={(e) => { const files = [...e.clipboardData.files]; if (!files.length) return; e.preventDefault(); attach(files.map((f, i) => (f.name === "image.png" ? new File([f], `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}${i ? `-${i}` : ""}.png`, { type: f.type }) : f))); }}
            />
            <div className="composer-bar">
              <input ref={picker} type="file" multiple hidden accept={ACCEPT} aria-label="Choose files to attach" tabIndex={-1} onChange={(e) => { attach([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <button type="button" className="quiet icon" onClick={() => picker.current?.click()} aria-label="Attach files" title="Attach files (or drop them here, or paste a picture)"><Icon name="paperclip" size={18} /></button>
              <span className="note grow">{text.length > 16000 ? `${text.length.toLocaleString()} / 20,000 characters` : "Enter sends · Shift+Enter for a new line"}</span>
              {chat.busy && !text.trim() && !pending.length
                ? <button type="button" className="primary send" aria-label="Stop" title="Stop the reply (Esc)" onClick={stop}><Icon name="stop" size={16} /></button>
                : <button className="primary send" disabled={!text.trim() && !pending.length} aria-label={chat.busy ? "Send after the reply" : "Send"} title={chat.busy ? "Send after the reply" : "Send"}><Icon name="up" size={18} /></button>}
            </div>
          </form>
          {notice && <p className="error" role="alert">{notice}</p>}
          {managerProblem && <p className="error" role="alert">{managerProblem}</p>}
          {topic.manager && manager && <p className="note">{manager.settings.autonomy === "autopilot" ? `On autopilot: ${manager.settings.parallel} task${manager.settings.parallel === 1 ? "" : "s"} at once, up to $${manager.settings.perTask} per task and $${manager.settings.perDay} per day ($${manager.spentToday.toFixed(2)} today). Change it with the Manager menu above or \`factory manager\`.` : manager.settings.autonomy === "assist" ? "On assist: you press the buttons." : "Autopilot is off: nothing starts by itself."}</p>}
          <p className="note">{topic.manager ? `${person.name} can read this project and ask the others. ${person.name} cannot change anything; anything to be done comes as a button you press.` : topic.readOnly ? `${person.name} can read this project and run read-only checks. ${person.name} cannot change anything.` : `${person.name} can read this project and write documents under docs/. ${person.name} cannot change code.`}</p>
        </section>
      )}
    </div>
  );
}
