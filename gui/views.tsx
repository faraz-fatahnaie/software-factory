import { useEffect, useMemo, useState } from "react";
import { costs, post, type CostRow, type Ev } from "./state";

type SetError = (e: string) => void;

/** Spend, tokens and stage pass rate, cut by model, role and task. All derived from the event log. */
export function Cost({ events }: { events: Ev[] }) {
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
  if (!by.model.size) return <p className="empty">No model stages recorded yet.</p>;
  return (
    <section className="page">
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
  if (!rows) return <p className="empty">Loading…</p>;
  if (!rows.length) return <p className="empty">No task worktrees. Each run creates one under .worktrees/.</p>;
  return (
    <section className="page">
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
          <p className="bar">
            <code>{path}</code>
            <label>Version{" "}
              <select value={rev} onChange={(e) => (!dirty || confirm("Discard unsaved changes?")) && open(path, e.target.value)}>
                <option value="">current</option>
                {doc.history.map((h) => <option key={h.sha} value={h.sha}>{h.date} {h.sha} {h.subject}</option>)}
              </select>
            </label>
            <button className="primary" disabled={!dirty && !rev} onClick={save}>{rev ? "Restore this version" : "Save"}</button>
            <span role="status">{status}</span>
          </p>
          <textarea aria-label={`Contents of ${path}`} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setStatus(""); }} />
        </div>
      )}
    </section>
  );
}
