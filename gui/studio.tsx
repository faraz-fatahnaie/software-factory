// Studio: a workspace for the files every agent reads (rules, role prompts, skills). Files on the left, the editor in the middle,
// what the file is and who uses it on the right. Saving takes two checks (review the difference, then commit), and any edit can be thrown away.
import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { call, post } from "./data";
import { Stat } from "./diff";
import { Icon } from "./icons";
import { counts, lineDiff, marks, withGaps, type Op, type Row } from "./linediff";
import { personaFor, Robot } from "./robots";
import type { TeamData } from "./team";
import { Skel } from "./ui";

type SetError = (e: string) => void;
type Version = { sha: string; date: string; subject: string };
type Doc = { content: string; history: Version[] };
type Skills = { installed: string[]; roles: Record<string, string[]> };
type Tab = "edit" | "preview" | "history";
type Ask = null | { kind: "discard" } | { kind: "leave"; then: () => void };
type Found = { pkg: string; installs: string; url: string };

const ROLE_FILE = /^\.claude\/agents\/([\w-]+)\.md$/, SKILL_FILE = /^\.claude\/skills\/([\w-]+)\/SKILL\.md$/;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Which kind of file this is decides what the side panel says. */
const kindOf = (path: string) => (ROLE_FILE.test(path) ? "role" : SKILL_FILE.test(path) ? "skill" : "rules");

// ---------------------------------------------------------------------------------------------------------------- Markdown preview

const inline = (t: string): ReactNode[] =>
  t.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part.startsWith("**") && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : part));

/** The few Markdown pieces these files use, drawn as React elements (never as raw HTML). The settings block at the top shows as a table. */
export function Markdown({ text }: { text: string }) {
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const settings: [string, string][] = [];
  for (const l of (front?.[1] ?? "").split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(l), item = /^\s+-\s+(.*)$/.exec(l);
    if (kv) settings.push([kv[1]!, kv[2]!]);
    else if (item && settings.length) { const last = settings[settings.length - 1]!; last[1] = last[1] ? `${last[1]}, ${item[1]}` : item[1]!; }
  }
  const ls = (front ? text.slice(front[0].length) : text).split("\n");
  const blocks: ReactNode[] = [];
  const startsBlock = (l: string) => /^(```|#{1,4}\s|\s*([-*]|\d+\.)\s)/.test(l);
  for (let i = 0, k = 0; i < ls.length; k++) {
    const l = ls[i]!;
    if (!l.trim() || /^<!--.*-->$/.test(l.trim())) { i++; continue; }
    if (l.startsWith("```")) {
      const buf: string[] = [];
      for (i++; i < ls.length && !ls[i]!.startsWith("```"); i++) buf.push(ls[i]!);
      i++;
      blocks.push(<pre key={k}><code>{buf.join("\n")}</code></pre>);
    } else if (/^#{1,4}\s/.test(l)) {
      const h = /^(#{1,4})\s+(.*)$/.exec(l)!;
      blocks.push(createElement(`h${h[1]!.length + 2}`, { key: k }, inline(h[2]!)));
      i++;
    } else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items: string[] = [];
      for (; i < ls.length && /^\s*([-*]|\d+\.)\s/.test(ls[i]!); i++) items.push(ls[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""));
      blocks.push(createElement(ordered ? "ol" : "ul", { key: k }, items.map((it, j) => <li key={j}>{inline(it)}</li>)));
    } else {
      const buf: string[] = [];
      for (; i < ls.length && ls[i]!.trim() && !startsBlock(ls[i]!); i++) buf.push(ls[i]!);
      blocks.push(<p key={k}>{inline(buf.join(" "))}</p>);
    }
  }
  return (
    <article className="md" aria-label="Preview">
      {settings.length > 0 && <dl className="md-settings">{settings.map(([key, v]) => <div key={key}><dt>{key}</dt><dd>{v || "–"}</dd></div>)}</dl>}
      {blocks.length ? blocks : <p className="note">Nothing to show yet.</p>}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------- Diff rows

function DiffRows({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <div className="udiff" role="group" aria-label={label}>
      {rows.map((r, i) => r.kind === "gap" ? (
        <div key={i} className="ln hunk"><span className="no" /><span className="no" /><span className="sign" /><code>… {plural(r.count, "unchanged line")}</code></div>
      ) : (
        <div key={i} className={`ln ${r.kind}`}>
          <span className="no" aria-hidden="true">{r.old}</span>
          <span className="no" aria-hidden="true">{r.neu}</span>
          <span className="sign" aria-hidden="true">{r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}</span>
          <code>{r.kind === "add" && <span className="sr">added: </span>}{r.kind === "del" && <span className="sr">removed: </span>}{r.text || " "}</code>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------- The two checks

type FlowProps = { step: "review" | "commit"; path: string; ops: Op[]; message: string; why: string; busy: boolean; fail: string; restored: string;
  setMessage: (m: string) => void; setWhy: (w: string) => void; go: (s: "review" | "commit") => void; close: () => void; commit: () => void; discard: () => void };

/** Check 1: read what will change. Check 2: name the commit and see what happens next. Nothing is written until the last button. */
function SaveFlow(p: FlowProps) {
  const box = useRef<HTMLDivElement>(null);
  const { added, removed } = counts(p.ops);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);
  useEffect(() => { box.current?.querySelector<HTMLElement>("[data-first]")?.focus(); }, [p.step]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); p.close(); }
    if (e.key !== "Tab") return;
    const items = [...box.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, a[href]")];
    const first = items[0]!, last = items.at(-1)!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const name = p.path.split("/").at(-1)!, dir = p.path.slice(0, p.path.length - name.length);
  return createPortal(
    <div className="st-overlay" onMouseDown={(e) => e.target === e.currentTarget && p.close()}>
      <div ref={box} className="st-dialog" role="dialog" aria-modal="true" aria-labelledby="st-dialog-title" onKeyDown={keys}>
        <header>
          <div className="row between wrap">
            <h2 id="st-dialog-title">{p.step === "review" ? "Review what will change" : "Commit your changes"}</h2>
            <ol className="steps" aria-label="Steps">
              <li className={p.step === "review" ? "on" : "done"} aria-current={p.step === "review" ? "step" : undefined}><b>{p.step === "review" ? "1" : "✓"}</b>Review</li>
              <li className={p.step === "commit" ? "on" : ""} aria-current={p.step === "commit" ? "step" : undefined}><b>2</b>Commit</li>
            </ol>
          </div>
          <p className="note">{p.step === "review" ? "Read the difference once more. Nothing is written until the last step." : <>This saves <code>{name}</code> as one commit: {plural(added, "line")} added, {removed} removed.</>}</p>
        </header>
        {p.step === "review" ? (
          <div className="st-body">
            <div className="row between wrap"><span className="path"><span className="dir">{dir}</span><b>{name}</b></span><Stat added={added} removed={removed} /></div>
            <div className="st-diff"><DiffRows rows={withGaps(p.ops)} label={`Changes in ${p.path}`} /></div>
            <p className="note">Only this file changes. Other files, GitHub and running tasks are untouched.</p>
          </div>
        ) : (
          <div className="st-body">
            <label className="field"><b>Commit message</b>
              <input className="mono" value={p.message} maxLength={200} onChange={(e) => p.setMessage(e.target.value)} />
              <span className="note">Shows in History and in Source. The suggestion is fine as it is.</span>
            </label>
            <label className="field"><b>Why <span className="note">(optional)</span></b>
              <textarea rows={3} maxLength={2000} value={p.why} placeholder="For example: the Builder kept retrying a failing gate for too long." onChange={(e) => p.setWhy(e.target.value)} />
            </label>
            <ul className="facts">
              <li><b>Where it goes.</b> One commit on the main branch of this project.</li>
              <li><b>Who sees it.</b> Agents use it from the next stage that starts. Running stages keep what they began with.</li>
              <li><b>GitHub.</b> Not pushed. It stays on this computer until you push.</li>
              {p.restored && <li><b>Restore.</b> This brings back version <code>{p.restored}</code> as a new commit. History is kept.</li>}
            </ul>
            {p.fail && <p className="error" role="alert">{p.fail}</p>}
          </div>
        )}
        <footer>
          {p.step === "review"
            ? <><button onClick={p.close}>Back to editing</button><span className="grow" /><button className="quiet" onClick={p.discard}>Discard changes</button><button className="primary" data-first onClick={() => p.go("commit")}>Continue to commit</button></>
            : <><button onClick={() => p.go("review")}>Back to review</button><span className="grow" /><button className="quiet" onClick={p.close}>Cancel</button><button className="primary" data-first disabled={p.busy || !p.message.trim()} onClick={p.commit}>{p.busy ? "Committing…" : "Commit changes"}</button></>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------------------------------------------- Skills panel

/** Skills for one role: detach, attach an installed one, or search skills.sh and install. */
function RoleSkills({ role, skills, locked, changed, setError }: { role: string; skills: Skills; locked: boolean; changed: () => Promise<void>; setError: SetError }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(""); // what the results on screen were searched for
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(""); // the result whose install awaits a yes
  const [forRoles, setForRoles] = useState<string[]>([role]); // who gets it: this role, and any others ticked
  const [limit, setLimit] = useState(10); // a search can return a hundred; ten at a time keeps the page short
  const [busy, setBusy] = useState("");
  useEffect(() => { setFound(null); setQuery(""); setConfirming(""); setLimit(10); setForRoles([role]); }, [role]);
  const attached = skills.roles[role] ?? [];
  const clear = () => { setQuery(""); setFound(null); setShown(""); setConfirming(""); setLimit(10); };
  const change = async (action: string, skill: string, roles: string[] = [role]) => {
    setBusy(`${action} ${skill}…`);
    const r = await post("/api/skill", { action, skill, role: roles.join(",") });
    setBusy(""); setConfirming("");
    setError(r.ok ? "" : r.error);
    await changed();
  };
  const ready = query.trim().length >= 2;
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const q = query.trim();
    setSearching(true); setFound(null); setConfirming(""); setLimit(10);
    const res = await fetch(`/api/skills/search?q=${encodeURIComponent(q)}`);
    setSearching(false);
    if (res.ok) { setFound(await res.json()); setShown(q); setError(""); } else setError((await res.json()).error);
  };
  return (
    <fieldset className="skills" disabled={locked}>
      <legend>Skills</legend>
      {locked && <p className="note">Save or discard your edits before changing skills. Attaching one rewrites this file.</p>}
      <p>
        {attached.length === 0 && <span className="note">None attached.</span>}
        {attached.map((s) => <span key={s} className="chip">{s} <button aria-label={`Detach ${s} from ${role}`} onClick={() => change("detach", s)}>×</button></span>)}
      </p>
      {skills.installed.some((s) => !attached.includes(s)) && (
        <p><span className="note">Installed, not attached:</span>
          {skills.installed.filter((s) => !attached.includes(s)).map((s) => <button key={s} onClick={() => change("attach", s)}>+ {s}</button>)}
        </p>
      )}
      <form role="search" className="skill-search" onSubmit={search}>
        <div className="field-box">
          <Icon name="search" size={15} />
          <input type="text" aria-label="Search skills.sh" placeholder="Find more skills on skills.sh" value={query} maxLength={60} autoComplete="off"
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && (query || found)) { e.preventDefault(); clear(); } }} />
          {(query || found) && <button type="button" className="quiet clear" aria-label="Clear search" onClick={clear}><Icon name="x" size={14} /></button>}
        </div>
        <button className={ready ? "primary" : ""} disabled={!ready || searching}>{searching ? "Searching…" : "Search"}</button>
      </form>
      {query.trim().length === 1 && <p className="note" role="status">Type at least 2 letters.</p>}
      <span className="sr" role="status">{busy || (searching ? "Searching skills.sh" : found ? `${found.length} results for ${shown}` : "")}</span>
      {busy && <p className="note">{busy}</p>}
      {searching && <div className="results" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="result"><Skel w="45%" h={14} /><Skel w="30%" h={11} /></div>)}</div>}
      {found && (
        <section className="results" aria-label={`Results for ${shown}`}>
          <header>
            <b>{found.length === 0 ? "No results" : found.length === 1 ? "1 result" : `${found.length} results`} for “{shown}”</b>
            <button type="button" className="quiet" onClick={clear}>Clear results</button>
          </header>
          {found.length === 0 && <p className="note">Nothing matched. Try one shorter or different word, like “test” instead of “testing”.</p>}
          <ul>
            {found.slice(0, limit).map((f) => {
              const [repo, name = repo] = f.pkg.split("@"), done = skills.installed.includes(name);
              return (
                <li key={f.pkg} className="result">
                  <div className="grow">
                    <b>{name}</b> <span className="note">{repo} · {f.installs} installs</span>
                    {confirming === f.pkg && <p className="warn-note" role="alert">A skill is third-party instructions your agents will follow. <a href={f.url} target="_blank" rel="noreferrer">Review it on skills.sh</a> first.</p>}
                    {confirming === f.pkg && (
                      <fieldset className="who" aria-label="Who gets this skill">
                        <legend className="note">Who gets it? Only these people can use it.</legend>
                        {Object.keys(skills.roles).map((r) => (
                          <label key={r}><input type="checkbox" checked={forRoles.includes(r)} onChange={(e) => setForRoles((l) => (e.target.checked ? [...l, r] : l.filter((x) => x !== r)))} /> {personaFor(r).name}</label>
                        ))}
                      </fieldset>
                    )}
                  </div>
                  {confirming === f.pkg ? (
                    <span className="row gap"><button className="primary" disabled={!forRoles.length} onClick={() => change("add", f.pkg, forRoles)}>Install and attach</button><button className="quiet" onClick={() => setConfirming("")}>Cancel</button></span>
                  ) : (
                    <span className="row gap"><a href={f.url} target="_blank" rel="noreferrer">Review</a><button disabled={done || attached.includes(name)} onClick={() => setConfirming(f.pkg)}>{done ? "Installed" : "Install"}</button></span>
                  )}
                </li>
              );
            })}
          </ul>
          {found.length > limit && <footer><button type="button" className="quiet" onClick={() => setLimit(limit + 10)}>Show {Math.min(10, found.length - limit)} more · {found.length - limit} not shown</button></footer>}
        </section>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------------------- The view

/** The right-hand panel: who a role file is for, who uses a skill, or what the rules are. */
function Side(p: { path: string; skills: Skills; team: TeamData | null; models: Record<string, { model: string; effort: string }>; locked: boolean; changed: () => Promise<void>; setError: SetError }) {
  const kind = kindOf(p.path), role = ROLE_FILE.exec(p.path)?.[1], skill = SKILL_FILE.exec(p.path)?.[1];
  if (role) {
    const who = personaFor(role), title = p.team?.roles.find((r) => r.name === role), m = p.models[role];
    return (
      <>
        <div className="row gap-s">
          <Robot role={role} size={44} />
          <div><div className="row gap-s wrap"><b>{who.name}</b>{m && <span className="tag mono" title="Model and effort. Change them in Agents.">{m.model} · {m.effort}</span>}</div><span className="note">{title?.title ?? role}{title?.description ? ` · ${title.description}` : ""}</span></div>
        </div>
        <p className="note">Changes here apply to the next stage {who.name} starts. A running stage keeps the prompt it began with.</p>
        <RoleSkills role={role} skills={p.skills} locked={p.locked} changed={p.changed} setError={p.setError} />
      </>
    );
  }
  if (skill) {
    const users = Object.entries(p.skills.roles).filter(([, list]) => list.includes(skill)).map(([r]) => r), others = Object.keys(p.skills.roles).filter((r) => !users.includes(r));
    const set = async (action: string, r: string) => { const res = await post("/api/skill", { action, skill, role: r }); p.setError(res.ok ? "" : res.error); await p.changed(); };
    return (
      <fieldset className="skills" disabled={p.locked}>
        <legend>Used by</legend>
        {p.locked && <p className="note">Save or discard your edits before changing who uses this skill.</p>}
        <p>{users.length === 0 && <span className="note">No role uses this skill yet.</span>}
          {users.map((r) => <span key={r} className="chip">{personaFor(r).name} <button aria-label={`Detach ${skill} from ${r}`} onClick={() => set("detach", r)}>×</button></span>)}</p>
        {others.length > 0 && <p><span className="note">Add to:</span>{others.map((r) => <button key={r} aria-label={`Attach ${skill} to ${r}`} onClick={() => set("attach", r)}>+ {personaFor(r).name}</button>)}</p>}
        <p className="note">A skill is a set of instructions a role follows. Editing it here changes it for every role that uses it.</p>
      </fieldset>
    );
  }
  return <p className="note">{kind === "rules" && p.path === "AGENTS.md" ? "The rules every agent reads before it starts, in every stage. A change applies to stages that start after you commit it." : "The file Claude Code reads first. It points to AGENTS.md."}</p>;
}

export function Studio({ setError, team }: { setError: SetError; team: TeamData | null }) {
  const [files, setFiles] = useState<string[]>([]);
  const [skills, setSkills] = useState<Skills>({ installed: [], roles: {} });
  const [models, setModels] = useState<Record<string, { model: string; effort: string }>>({});
  const [path, setPath] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [text, setText] = useState("");
  const [tab, setTab] = useState<Tab>("edit");
  const [filter, setFilter] = useState("");
  const [flow, setFlow] = useState<null | "review" | "commit">(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [message, setMessage] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const [done, setDone] = useState<{ sha: string; message: string } | null>(null);
  const [restored, setRestored] = useState(""); // the version whose text is in the editor, until it is saved or thrown away
  const [ver, setVer] = useState("");
  const [old, setOld] = useState<string | null>(null);
  const [show, setShow] = useState<"changes" | "file">("changes");
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const gutter = useRef<HTMLDivElement>(null);

  const loadFiles = () => fetch("/api/files").then((r) => r.json()).then(setFiles);
  const loadSkills = () => fetch("/api/skills").then((r) => r.json()).then(setSkills);
  useEffect(() => {
    loadFiles(); loadSkills();
    fetch("/api/config").then((r) => r.json()).then((c) => setModels(Object.fromEntries(Object.entries(c.roles as Record<string, { model: string; effort: string }>).map(([r, v]) => [r, { model: v.model, effort: v.effort }]))));
  }, []);

  const read = async (p: string, rev = ""): Promise<Doc> => (await fetch(`/api/file?path=${encodeURIComponent(p)}${rev ? `&rev=${rev}` : ""}`)).json();
  const open = async (p: string, keepDone = false) => {
    const d = await read(p);
    setPath(p); setDoc(d); setText(d.content); setAsk(null); setFlow(null); setRestored(""); setVer(""); setOld(null); setFail("");
    if (!keepDone) { setDone(null); setTab("edit"); }
  };
  const dirty = doc !== null && text !== doc.content;
  const ops = useMemo(() => (doc ? lineDiff(doc.content, text) : []), [doc?.content, text]);
  const mark = useMemo(() => marks(ops), [ops]);
  const { added, removed } = counts(ops);
  const changed = ops.filter((o) => o.kind !== "ctx").length;
  const guard = (then: () => void) => (dirty ? setAsk({ kind: "leave", then }) : then());
  const discard = () => { setText(doc!.content); setRestored(""); setAsk(null); setFlow(null); };

  const choose = async (sha: string) => { setVer(sha); setOld(null); setOld((await read(path, sha)).content); };
  const openHistory = () => {
    setTab("history");
    const first = doc?.history[1] ?? doc?.history[0];
    if (first && !ver) choose(first.sha);
  };
  const restore = () => guard(() => { setText(old ?? ""); setRestored(ver); setTab("edit"); setDone(null); });
  const startFlow = () => { setMessage(`studio: edit ${path}`); setWhy(""); setFail(""); setFlow("review"); };
  const commit = async () => {
    setBusy(true); setFail("");
    const r = await call<{ committed: boolean; sha: string }>("/api/file", { path, content: text, message, why });
    setBusy(false);
    if (!r.ok) { setFail(r.error); setError(r.error); return; }
    setError("");
    const subject = message.trim();
    await open(path, true);
    setFlow(null);
    setDone(r.data.committed ? { sha: r.data.sha, message: subject } : null);
    loadFiles(); loadSkills();
  };
  const afterSkillChange = async () => { await Promise.all([loadSkills(), loadFiles()]); if (path) await open(path, true); };

  const entries = useMemo(() => files.map((f) => {
    const role = ROLE_FILE.exec(f)?.[1], skill = SKILL_FILE.exec(f)?.[1];
    const users = skill ? Object.values(skills.roles).filter((l) => l.includes(skill)).length : 0;
    return role ? { f, group: "Team", label: personaFor(role).name, sub: team?.roles.find((r) => r.name === role)?.title ?? role, role }
      : skill ? { f, group: "Skills", label: skill, sub: users ? plural(users, "role") : "not used", role: "" }
      : { f, group: "Rules", label: f, sub: f === "AGENTS.md" ? "everyone" : "", role: "" };
  }), [files, skills, team]);
  const shown = entries.filter((e) => `${e.label} ${e.sub} ${e.f}`.toLowerCase().includes(filter.trim().toLowerCase()));

  const name = path.split("/").at(-1) ?? "", dir = path.slice(0, path.length - name.length).split("/").filter(Boolean).join(" / ");
  const entry = entries.find((e) => e.f === path);
  const lines = text.split("\n").length;
  const gutterRows = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1), [lines]);
  const mod = (key: "add" | "mod" | "del" | undefined) => (key ? ` ${key}` : "");
  const marked = { add: "added line", mod: "changed line", del: "lines removed above" } as const;
  const versions = doc?.history ?? [];
  const selected = versions.find((v) => v.sha === ver);
  const sameAsCurrent = selected && selected.sha === versions[0]?.sha && !dirty;
  const vOps = useMemo(() => (old === null || !doc ? [] : lineDiff(doc.content, old)), [old, doc?.content]);
  const move = (e: React.KeyboardEvent, d: number) => {
    e.preventDefault();
    const next = versions[Math.max(0, Math.min(versions.length - 1, versions.findIndex((v) => v.sha === ver) + d))];
    if (next) { choose(next.sha); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ver="${next.sha}"]`)?.focus()); }
  };

  const kindText = !path ? "" : ROLE_FILE.test(path) ? `Role prompt for ${personaFor(ROLE_FILE.exec(path)![1]!).name}, the ${entry?.sub}` : SKILL_FILE.test(path) ? "Skill" : path === "AGENTS.md" ? "Rules every agent follows" : "Claude Code entry file";

  return (
    <section className="studio" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s" && doc) { e.preventDefault(); if (dirty && !flow) startFlow(); } }}>
      <nav className="st-pane st-files" aria-label="Files">
        <label className="field-box">
          <Icon name="search" size={15} />
          <input type="text" aria-label="Filter files" placeholder="Filter files" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filter && <button type="button" className="quiet clear" aria-label="Clear filter" onClick={() => setFilter("")}><Icon name="x" size={14} /></button>}
        </label>
        {files.length === 0 ? <div className="st-skel">{[0, 1, 2, 3, 4].map((i) => <Skel key={i} h={30} r={8} />)}</div> : (
          <>
            {(["Rules", "Team", "Skills"] as const).map((g) => {
              const list = shown.filter((e) => e.group === g);
              return list.length === 0 ? null : (
                <div key={g} role="group" aria-label={g}>
                  <h2>{g}{g === "Skills" ? ` · ${list.length}` : ""}</h2>
                  {list.map((e) => (
                    <button key={e.f} className={`fi${e.f === path ? " on" : ""}`} aria-current={e.f === path ? "page" : undefined} title={e.f} onClick={() => e.f !== path && guard(() => open(e.f))}>
                      {e.role && <Robot role={e.role} size={26} />}
                      <span className="nm">{e.label}</span>
                      {e.f === path && dirty ? <small className="modified"><i aria-hidden="true" /> Modified</small> : e.sub ? <small>{e.sub}</small> : null}
                    </button>
                  ))}
                </div>
              );
            })}
            {shown.length === 0 && <p className="note">No file matches “{filter}”.</p>}
          </>
        )}
      </nav>

      {!doc ? (
        <p className="empty st-main-empty">Pick a file from the list. Rules, role prompts and skills are editable here, and every save is a commit.</p>
      ) : (
        <>
          <main className="st-pane st-main" aria-label={`Editing ${path}`}>
            <header className="st-head">
              <div className="grow">
                <div className="path"><span className="dir">{dir ? `${dir} /` : ""}</span></div>
                <h2>{name} <span className="note">· {kindText}</span></h2>
              </div>
              <div className="pills" role="tablist" aria-label="View">
                <button role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")}>Edit</button>
                <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
                <button role="tab" aria-selected={tab === "history"} onClick={openHistory}>History{versions.length ? ` · ${versions.length}` : ""}</button>
              </div>
            </header>

            {ask?.kind === "discard" ? (
              <div className="st-bar danger" role="alert">
                <span><b>Throw away {plural(changed, "changed line")}?</b> <span className="note">The file goes back to the last commit. This cannot be undone.</span></span>
                <span className="row gap"><button onClick={() => setAsk(null)}>Keep editing</button><button className="danger-btn" onClick={discard}>Discard changes</button></span>
              </div>
            ) : ask?.kind === "leave" ? (
              <div className="st-bar" role="alert">
                <span><b>{name} has changes that are not saved.</b></span>
                <span className="row gap wrap"><button className="quiet" onClick={() => setAsk(null)}>Stay here</button><button onClick={() => { const next = ask.then; discard(); next(); }}>Discard and continue</button><button className="primary" onClick={() => { setAsk(null); startFlow(); }}>Review changes</button></span>
              </div>
            ) : dirty ? (
              <div className="st-bar warn" role="status">
                <span className="row gap"><i className="dot" aria-hidden="true" /><span><b>{plural(changed, "line")} changed</b> <span className="note">(+{added} −{removed}) since the last commit. Nothing is saved yet.</span>{restored && <span className="note"> Version <code>{restored}</code> is in the editor.</span>}</span></span>
                <span className="row gap"><button onClick={() => setAsk({ kind: "discard" })}>Discard changes</button><button className="primary" onClick={startFlow}>Review changes</button></span>
              </div>
            ) : done ? (
              <div className="st-bar ok" role="status">
                <span className="row gap"><b aria-hidden="true">✓</b><span><b>Committed</b> <code>{done.sha}</code> <span className="note">{done.message}</span></span></span>
                <span className="row gap"><button className="quiet" onClick={openHistory}>See in History</button><button className="quiet" onClick={() => { location.hash = "#source"; }}>Open in Source</button></span>
              </div>
            ) : null}

            {tab === "edit" && (
              <>
                <div className="st-editor">
                  <div className="gutter" ref={gutter} aria-hidden="true">
                    {gutterRows.map((n) => <span key={n} className={`gn${mod(mark.get(n))}`} title={mark.get(n) ? marked[mark.get(n)!] : undefined}>{n}</span>)}
                  </div>
                  <textarea aria-label={`Contents of ${path}`} value={text} spellCheck={false} wrap="off"
                    onChange={(e) => { setText(e.target.value); setDone(null); setFail(""); }}
                    onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
                    onSelect={(e) => { const before = e.currentTarget.value.slice(0, e.currentTarget.selectionStart).split("\n"); setCursor({ ln: before.length, col: before.at(-1)!.length + 1 }); }} />
                </div>
                <div className="st-status">
                  <span>Markdown · {plural(lines, "line")} · Ln {cursor.ln}, Col {cursor.col}</span>
                  {dirty ? <span className="modified">Unsaved changes · last commit <code>{versions[0]?.sha}</code></span> : <span>Saved as commit <code>{versions[0]?.sha ?? "–"}</code>{versions[0] ? ` · ${versions[0].date}` : ""}</span>}
                </div>
              </>
            )}

            {tab === "preview" && <div className="st-preview"><Markdown text={text} /></div>}

            {tab === "history" && (
              !selected ? <p className="empty">Pick a version on the right to see how the file changed.</p> : old === null ? <div className="st-preview"><Skel h={16} /><Skel w="70%" h={16} /><Skel w="85%" h={16} /></div> : (
                <>
                  <div className="st-bar info" role="status">
                    <span><b>{sameAsCurrent ? "This is the current version" : "Viewing an older version"}</b> <span className="note">· <code>{selected.sha}</code> · {selected.date} · read-only</span></span>
                    <span className="row gap"><button onClick={() => setTab("edit")}>Back to current</button>{!sameAsCurrent && <button className="primary" onClick={restore}>Restore this version</button>}</span>
                  </div>
                  <div className="st-histbar">
                    <div className="pills" role="tablist" aria-label="Show">
                      <button role="tab" aria-selected={show === "changes"} onClick={() => setShow("changes")}>What restoring would change</button>
                      <button role="tab" aria-selected={show === "file"} onClick={() => setShow("file")}>Whole file</button>
                    </div>
                    {show === "changes" && <Stat added={counts(vOps).added} removed={counts(vOps).removed} />}
                  </div>
                  <div className="st-diff scroll">
                    {show === "changes" ? (vOps.every((o) => o.kind === "ctx") ? <p className="empty">Identical to the version in the editor.</p> : <DiffRows rows={withGaps(vOps)} label={`What restoring ${selected.sha} would change`} />)
                      : <DiffRows rows={lineDiff(old, old)} label={`Whole file at ${selected.sha}`} />}
                  </div>
                  <p className="note st-foot">Restore puts this version in the editor. You still go through the two checks before anything is saved.</p>
                </>
              )
            )}
          </main>

          <aside className="st-pane st-side" aria-label={tab === "history" ? `Versions of ${name}` : "About this file"}>
            {tab === "history" ? (
              <>
                <h2>Versions of {name}</h2>
                <ol className="timeline" onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}>
                  {versions.map((v, i) => (
                    <li key={v.sha}>
                      <button className={`ver${v.sha === ver ? " on" : ""}`} data-ver={v.sha} aria-pressed={v.sha === ver} onClick={() => choose(v.sha)}>
                        <i aria-hidden="true" />
                        <span><b>{i === 0 ? "Current" : v.sha === ver ? "Selected" : ""}</b> <code>{v.sha}</code></span>
                        <span className="note">{v.subject} · {v.date}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="note">Arrow keys move between versions.</p>
              </>
            ) : <Side path={path} skills={skills} team={team} models={models} locked={dirty} changed={afterSkillChange} setError={setError} />}
          </aside>
        </>
      )}

      {flow && doc && (
        <SaveFlow step={flow} path={path} ops={ops} message={message} why={why} busy={busy} fail={fail} restored={restored} setMessage={setMessage} setWhy={setWhy}
          go={setFlow} close={() => setFlow(null)} commit={commit} discard={() => { discard(); }} />
      )}
    </section>
  );
}
