import { useEffect, useMemo, useState } from "react";
import { costs, elapsed, roster, type CostRow, type Ev, type TaskRun } from "../plugin/engine/state";
import { Feed, logLine } from "./app";
import { post, useNow } from "./data";
import { personaFor, Robot } from "./robots";
import { Select, ViewSkeleton } from "./ui";

type SetError = (e: string) => void;

/** Spend, tokens and stage pass rate, cut by model, role and task. All derived from the event log. */
function Cost({ events }: { events: Ev[] }) {
  const by = useMemo(() => costs(events), [events]);
  const total = [...by.model.values()].reduce((sum, r) => sum + r.cost, 0);
  const table = (title: string, rows: Map<string, CostRow>) => (
    <table>
      <caption>{title}</caption>
      <thead>
        <tr><th scope="col">{title.slice(3)}</th><th scope="col">Stages</th><th scope="col">Passed</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Cost</th></tr>
      </thead>
      <tbody>
        {[...rows].sort((a, b) => b[1].cost - a[1].cost).map(([key, r]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{r.stages}</td>
            <td>{Math.round((r.ok / r.stages) * 100)}%</td>
            <td>{r.input.toLocaleString()}</td>
            <td>{r.output.toLocaleString()}</td>
            <td>${r.cost.toFixed(4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (!by.model.size) return <p className="empty">No model stages recorded yet. Spend and pass rates appear after the first run.</p>;
  return (
    <section className="tile wide">
      <header><h2>Spend and pass rate</h2></header>
      <p className="total">Total ${total.toFixed(4)} <small>at list prices, as reported by the Claude CLI. On a subscription this is an equivalent, not a charge.</small></p>
      {table("By model", by.model)}
      {table("By role", by.role)}
      {table("By task", by.task)}
    </section>
  );
}

type Worktree = { id: string; path: string; branch: string; ahead: number; uncommitted: number };

export function Worktrees({ open, discard }: { open: (id: string) => void; discard: (id: string) => Promise<unknown> }) {
  const [rows, setRows] = useState<Worktree[] | null>(null);
  const load = () => fetch("/api/worktrees").then((r) => r.json()).then(setRows).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  if (!rows) return <ViewSkeleton kind="list" />;
  if (!rows.length) return <p className="empty">No task worktrees. Each run creates one under .worktrees/.</p>;
  return (
    <section className="tile wide page">
      <table>
        <caption>One git worktree and branch per task. Discard deletes both, including uncommitted work.</caption>
        <thead>
          <tr><th scope="col">Task</th><th scope="col">Branch</th><th scope="col">Path</th><th scope="col">Commits ahead</th><th scope="col">Uncommitted files</th><th scope="col">Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <th scope="row">{w.id}</th>
              <td><code>{w.branch}</code></td>
              <td><code>{w.path}</code></td>
              <td>{w.ahead}</td>
              <td>{w.uncommitted}</td>
              <td className="actions">
                <button onClick={() => open(w.id)}>Open task</button>
                <button className="danger" onClick={() => confirm(`Delete the worktree and branch for ${w.id}?`) && discard(w.id).then(load)}>Discard</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type Found = { pkg: string; installs: string; url: string };

/** Skills for one role: detach, attach an installed one, or search skills.sh and install. */
function RoleSkills({ role, changed, setError }: { role: string; changed: () => void; setError: SetError }) {
  const [skills, setSkills] = useState<{ installed: string[]; roles: Record<string, string[]> }>({ installed: [], roles: {} });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState("");
  const load = () => fetch("/api/skills").then((r) => r.json()).then(setSkills);
  useEffect(() => { load(); }, [role]);
  const attached = skills.roles[role] ?? [];
  const change = async (action: string, skill: string) => {
    setBusy(`${action} ${skill}…`);
    const r = await post("/api/skill", { action, skill, role });
    setBusy("");
    setError(r.ok ? "" : r.error);
    await load();
    changed();
  };
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("Searching skills.sh…");
    const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}`);
    setBusy("");
    if (res.ok) setFound(await res.json());
    else setError((await res.json()).error);
  };
  return (
    <fieldset className="skills">
      <legend>Skills for {role}</legend>
      <p>
        {attached.length === 0 && "None attached. "}
        {attached.map((s) => (
          <span key={s} className="chip">{s} <button aria-label={`Detach ${s} from ${role}`} onClick={() => change("detach", s)}>×</button></span>
        ))}
      </p>
      <p>
        {skills.installed.filter((s) => !attached.includes(s)).map((s) => (
          <button key={s} onClick={() => change("attach", s)}>+ {s}</button>
        ))}
      </p>
      <form onSubmit={search}>
        <input aria-label="Search skills.sh" placeholder="Search skills.sh…" value={query} minLength={2} maxLength={60} required onChange={(e) => setQuery(e.target.value)} />
        <button>Search</button> <span role="status">{busy}</span>
      </form>
      {found && (
        <ul>
          {found.length === 0 && <li>No skills found.</li>}
          {found.map((f) => (
            <li key={f.pkg}>
              <code>{f.pkg}</code> · {f.installs} installs · <a href={f.url} target="_blank" rel="noreferrer">review on skills.sh</a>{" "}
              <button onClick={() => confirm(`Install ${f.pkg} and attach it to ${role}? A skill is third-party instructions your agents will follow; review it first.`) && change("add", f.pkg)}>
                Install and attach
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

type Doc = { content: string; history: { sha: string; date: string; subject: string }[] };

/** Editor for the rules file, role files and skills. Saving commits that one file; history is its git log. */
export function Studio({ setError }: { setError: SetError }) {
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [text, setText] = useState("");
  const [rev, setRev] = useState("");
  const [status, setStatus] = useState("");
  const loadFiles = () => fetch("/api/files").then((r) => r.json()).then(setFiles);
  useEffect(() => { loadFiles(); }, []);
  const dirty = doc !== null && text !== doc.content;

  const open = async (p: string, r = "") => {
    const d: Doc = await (await fetch(`/api/file?path=${encodeURIComponent(p)}${r ? `&rev=${r}` : ""}`)).json();
    setPath(p); setRev(r); setDoc(d); setText(d.content); setStatus("");
  };
  const pick = (p: string) => (!dirty || confirm("Discard unsaved changes?")) && open(p);
  const save = async () => {
    const r = await post("/api/file", { path, content: text });
    setError(r.ok ? "" : r.error);
    if (!r.ok) return;
    await open(path);
    setStatus("Saved and committed");
  };
  const role = path.match(/^\.claude\/agents\/([\w-]+)\.md$/)?.[1];

  return (
    <section className="studio">
      <nav aria-label="Editable files">
        <ul>
          {files.map((f) => (
            <li key={f}><button aria-current={f === path ? "page" : undefined} onClick={() => pick(f)}>{f.replace(/^\.claude\//, "").replace(/\/SKILL\.md$/, "")}</button></li>
          ))}
        </ul>
      </nav>
      {!doc ? <p className="empty">Pick a file. Rules, role prompts and skills are editable here; every save is a commit.</p> : (
        <div>
          {role && <RoleSkills role={role} changed={() => { loadFiles(); open(path); }} setError={setError} />}
          <p className="toolbar">
            <code>{path}</code>
            <Select small label="Version" prefix="Version" value={rev} minWidth={320}
              options={[{ value: "", label: "current" }, ...doc.history.map((h) => ({ value: h.sha, label: `${h.date} ${h.sha}`, hint: h.subject }))]}
              onChange={(v) => (!dirty || confirm("Discard unsaved changes?")) && open(path, v)} />
            <button className="primary" disabled={!dirty && !rev} onClick={save}>{rev ? "Restore this version" : "Save"}</button>
            <span role="status">{status}</span>
          </p>
          <textarea aria-label={`Contents of ${path}`} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setStatus(""); }} />
        </div>
      )}
    </section>
  );
}

type RoleConfig = { runner: string; model: string; effort: string; fallback: string[] };
const MODELS = ["fable", "opus", "sonnet", "haiku"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const MODEL_HINT: Record<string, string> = { fable: "Most capable", opus: "Deepest thinking, slower", sonnet: "Balanced", haiku: "Fast and cheap" };
const EFFORT_HINT: Record<string, string> = { low: "Quick", medium: "Balanced", high: "Thorough", xhigh: "Very thorough", max: "As deep as it goes" };

function Models({ setError }: { setError: (e: string) => void }) {
  const [config, setConfig] = useState<{ roles: Record<string, RoleConfig> } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setConfig); }, []);
  if (!config) return <ViewSkeleton kind="list" />;
  const set = (role: string, patch: Partial<RoleConfig>) => {
    setSaved(false);
    setConfig({ ...config, roles: { ...config.roles, [role]: { ...config.roles[role]!, ...patch } } });
  };
  const save = async () => {
    const r = await post("/api/config", { roles: config.roles });
    setError(r.ok ? "" : r.error);
    setSaved(r.ok);
  };
  return (
    <section className="tile wide models">
      <header><h2>Models per role</h2></header>
      <table>
        <caption>Model, effort and fallback chain per role. Changes apply to the next stage that starts.</caption>
        <thead>
          <tr><th scope="col">Role</th><th scope="col">Model</th><th scope="col">Effort</th><th scope="col">Fallback chain (on rate limit)</th></tr>
        </thead>
        <tbody>
          {Object.entries(config.roles).map(([role, r]) => (
            <tr key={role}>
              <th scope="row"><span className="row gap-s"><Robot role={role} size={30} /><span><b>{personaFor(role).name}</b> <span className="note">{role}</span></span></span></th>
              <td><Select small label={`${role} model`} value={r.model} options={[...new Set([...MODELS, r.model])].map((m) => ({ value: m, label: m, hint: MODEL_HINT[m] }))} onChange={(v) => set(role, { model: v })} /></td>
              <td><Select small label={`${role} effort`} value={r.effort} options={EFFORTS.map((x) => ({ value: x, label: x, hint: EFFORT_HINT[x] }))} onChange={(v) => set(role, { effort: v })} /></td>
              <td>
                <input
                  aria-label={`${role} fallback models, comma separated`}
                  value={r.fallback.join(", ")}
                  placeholder="none"
                  onChange={(e) => set(role, { fallback: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="primary" onClick={save}>Save</button>
      {saved && <span role="status"> Saved to factory.config.json</span>}
    </section>
  );
}


/** Who is working, which model each role uses, and what it has cost. */
export function Agents(p: { events: Ev[]; tasks: Map<string, TaskRun>; setError: SetError; open: (id: string) => void }) {
  const working = useMemo(() => roster(p.tasks), [p.tasks]);
  const now = useNow(working.length > 0);
  return (
    <div className="stack">
      <section className="tile wide">
        <header><h2>Working now</h2></header>
        {working.length === 0 ? <p className="empty">No agents are running. Each stage of a task starts one, on the model set for its role below.</p> : (
          <table>
            <thead><tr><th scope="col">Task</th><th scope="col">Stage</th><th scope="col">Role</th><th scope="col">Model</th><th scope="col">Running for</th></tr></thead>
            <tbody>
              {working.map((w) => (
                <tr key={w.task}>
                  <td><button className="chip-id" onClick={() => p.open(w.task)}>{w.task}</button></td>
                  <td>{w.stage}</td><td>{w.role}</td><td><code>{w.model || "none (gate)"}</code></td>
                  <td className="num">{elapsed(w.since, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Models setError={p.setError} />
      <Cost events={p.events} />
    </div>
  );
}

const KINDS: Record<string, (cls: string) => boolean> = {
  All: () => true,
  Stages: (c) => c === "head" || c === "ok",
  Tools: (c) => c === "tool",
  Messages: (c) => c === "msg",
  Problems: (c) => c === "bad" || c === "warn",
};

/** Every event from every task, filterable. The task panel in Backlog shows one task with replay. */
export function Logs({ events }: { events: Ev[] }) {
  const [kind, setKind] = useState("All");
  const [task, setTask] = useState("");
  const ids = useMemo(() => [...new Set(events.map((e) => e.task).filter((t) => /^F-\d+$/.test(t)))], [events]);
  const shown = useMemo(() => events.filter((e) => (!task || e.task === task) && KINDS[kind]!(logLine(e)?.cls ?? "")), [events, kind, task]);
  return (
    <div className="stack">
      <section className="tile wide logs">
        <p className="toolbar">
          <span className="pills" role="group" aria-label="Kind of event">
            {Object.keys(KINDS).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}
          </span>
          <Select small label="Task" prefix="Task" value={task} options={[{ value: "", label: "all" }, ...ids.map((id) => ({ value: id, label: id }))]} onChange={setTask} minWidth={160} />
          <span className="note num">{shown.length} events</span>
        </p>
        <Feed events={shown} limit={500} />
      </section>
    </div>
  );
}
