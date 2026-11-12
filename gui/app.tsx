import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { elapsed, post, STAGES, summarize, toolLine, type Ev, type TaskRun } from "./state";
import { Cost, Studio, Worktrees } from "./views";

type Item = { id: string; prio?: string; title: string; section: string };
type Backlog = { items: Item[]; running: string[] };
type RoleConfig = { runner: string; model: string; effort: string; fallback: string[] };
type Act = (path: string, body: unknown) => Promise<boolean>;

const VIEWS = ["Pipeline", "Models", "Cost", "Worktrees", "Studio", "Graph"] as const;
const SECTIONS = ["Inbox", "Ready", "In progress", "Awaiting approval", "Blocked", "Done"];
const MODELS = ["fable", "opus", "sonnet", "haiku"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** The whole event log, live. EventSource reconnects by itself and resumes from the last event id. */
function useEvents(): Ev[] {
  const [events, setEvents] = useState<Ev[]>([]);
  useEffect(() => {
    // ponytail: keeps every event in memory. Window by run if the log grows past what a tab handles.
    const all: Ev[] = [];
    let queued = false;
    const source = new EventSource("/api/events?after=0");
    source.onmessage = (m) => {
      all.push(JSON.parse(m.data));
      if (queued) return; // one render per batch, however many events replay at once
      queued = true;
      // A timer, not requestAnimationFrame: frames stop in a background tab and the log would stall.
      setTimeout(() => { queued = false; setEvents([...all]); }, 50);
    };
    return () => source.close();
  }, []);
  return events;
}

function useBacklog(): [Backlog, () => void] {
  const [backlog, setBacklog] = useState<Backlog>({ items: [], running: [] });
  const load = () => fetch("/api/backlog").then((r) => r.json()).then(setBacklog).catch(() => {});
  useEffect(() => {
    load();
    // ponytail: polls every 2s, because people also edit BACKLOG.md by hand and that emits no event.
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);
  return [backlog, load];
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function StageStrip({ run }: { run: TaskRun }) {
  return (
    <ol className="stages">
      {STAGES.map((name) => {
        const s = run.stages[name];
        return (
          <li key={name} className={s?.state ?? "pending"} title={s ? `${name}: ${s.state}${s.model ? ` on ${s.model}` : ""}` : `${name}: not started`}>
            {name}
            {s?.state === "active" && s.model ? ` · ${s.model}` : ""}
          </li>
        );
      })}
    </ol>
  );
}

function Card(p: { item: Item; run?: TaskRun; running: boolean; selected: boolean; now: number; stub: boolean; act: Act; select: () => void }) {
  const { item, run, act } = p;
  const id = { id: item.id };
  const showRun = run && ["In progress", "Awaiting approval", "Blocked"].includes(item.section);
  return (
    <li className={`card${p.selected ? " selected" : ""}`}>
      <button className="open" onClick={p.select} aria-pressed={p.selected}>
        <span className="id">{item.id}</span>
        {item.prio && <span className="prio">{item.prio}</span>}
        <span className="title">{item.title}</span>
      </button>
      {showRun && (
        <>
          <StageStrip run={run} />
          <p className="meta">
            {run.status === "running" ? elapsed(run.started, p.now) : run.ended ? elapsed(run.started, Date.parse(run.ended)) : ""}
            {run.cost > 0 && ` · $${run.cost.toFixed(3)}`}
            {` · .worktrees/${item.id}`}
          </p>
        </>
      )}
      <div className="actions">
        {item.section === "Inbox" && <button onClick={() => act("/api/promote", id)}>Promote to Ready</button>}
        {(item.section === "Ready" || item.section === "Blocked") && (
          <button onClick={() => act("/api/run", { ids: [item.id], stub: p.stub })}>{item.section === "Blocked" ? "Retry" : "Run"}</button>
        )}
        {p.running && <button className="danger" onClick={() => act("/api/stop", id)}>Stop</button>}
        {item.section === "Awaiting approval" && <button className="primary" onClick={p.select}>Review</button>}
        {item.section === "Blocked" && <button className="danger" onClick={() => confirm(`Delete the work for ${item.id}?`) && act("/api/discard", id)}>Discard</button>}
      </div>
    </li>
  );
}

function logLine(e: Ev): { cls: string; text: string } | null {
  const usage = e.data?.usage;
  switch (e.type) {
    case "run.start": return { cls: "head", text: `Run ${e.run} started` };
    case "stage.start": return { cls: "head", text: `▶ ${e.stage}${e.model ? ` · ${e.role} on ${e.model}` : ""}` };
    case "agent.tool": return { cls: "tool", text: toolLine(e.data ?? {}) };
    case "agent.message": return { cls: "msg", text: e.data?.text ?? "" };
    case "agent.rate_limit": return null;
    case "stage.ok": return {
      cls: "ok",
      text: `✓ ${e.stage} passed${usage ? ` · $${(usage.costUsd ?? 0).toFixed(4)} · ${usage.turns ?? "?"} turns` : ""}${usage?.denials?.length ? ` · denied: ${usage.denials.join("; ")}` : ""}`,
    };
    case "stage.rate_limited": return { cls: "warn", text: `Rate limited on ${e.model}; trying the next model in the chain` };
    case "run.done": return { cls: "ok", text: "Review approved. Waiting for a person." };
    case "run.failed": return { cls: "bad", text: `Run failed: ${e.data}` };
    case "task.landed": return { cls: "ok", text: `Landed: ${e.data?.where}` };
    case "task.discarded": return { cls: "warn", text: "Discarded" };
    default:
      return e.type.startsWith("stage.")
        ? { cls: "bad", text: `✗ ${e.stage} ${e.type.slice(6)}\n${typeof e.data === "string" ? e.data : e.data?.error ?? ""}` }
        : null;
  }
}

function Diff({ id }: { id: string }) {
  const [text, setText] = useState("Loading…");
  useEffect(() => {
    fetch(`/api/diff?id=${id}`).then(async (r) => setText(r.ok ? (await r.text()) || "No changes on this branch." : "No branch for this task yet."));
  }, [id]);
  return (
    <pre className="diff">
      {text.split("\n").map((line, i) => {
        const cls = line.startsWith("diff --git") ? "file" : line.startsWith("@@") ? "hunk" : /^\+(?!\+\+)/.test(line) ? "add" : /^-(?!--)/.test(line) ? "del" : "";
        return <span key={i} className={cls}>{line + "\n"}</span>;
      })}
    </pre>
  );
}

function Detail(p: { item: Item; run?: TaskRun; act: Act; close: () => void }) {
  const { item, run, act } = p;
  const awaiting = item.section === "Awaiting approval";
  const [tab, setTab] = useState(awaiting ? "Diff" : "Log");
  const end = useRef<HTMLDivElement>(null);
  // Replay: show the run as it was after its first `upTo` events. null follows the live log.
  const [upTo, setUpTo] = useState<number | null>(null);
  const all = run?.events ?? [];
  const shown = upTo === null ? all : all.slice(0, upTo);
  const then = upTo === null ? run : summarize(shown).tasks.get(item.id);
  useEffect(() => { if (tab === "Log" && upTo === null) end.current?.scrollIntoView({ block: "nearest" }); }, [all.length, tab]);
  const id = { id: item.id };
  return (
    <section className="detail" aria-label={`Task ${item.id}`}>
      <header>
        <h2>{item.id} <span>{item.title}</span></h2>
        <button onClick={p.close} aria-label="Close task detail">Close</button>
      </header>
      <nav className="tabs" role="tablist">
        {["Log", "Spec", "Review", "Diff"].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
        {awaiting && (
          <span className="gate">
            <button className="primary" onClick={() => act("/api/approve", id)}>Approve and land</button>
            <button className="danger" onClick={() => confirm(`Delete the work for ${item.id}?`) && act("/api/discard", id)}>Discard</button>
          </span>
        )}
      </nav>
      {tab === "Log" && all.length > 1 && (
        <div className="replay">
          <label>
            Replay{" "}
            <input type="range" min={1} max={all.length} value={upTo ?? all.length}
              onChange={(e) => setUpTo(Number(e.target.value) >= all.length ? null : Number(e.target.value))} />
          </label>
          <span>{upTo === null ? "live" : `event ${upTo} of ${all.length} · ${new Date(shown.at(-1)!.ts).toLocaleTimeString()}`}</span>
          {then && <StageStrip run={then} />}
        </div>
      )}
      {tab === "Log" && (
        <div className="log" role="log">
          {!run && <p className="empty">No run recorded for this task yet.</p>}
          {shown.map((e) => {
            const line = logLine(e);
            return line && <pre key={e.seq} className={line.cls}>{line.text}</pre>;
          })}
          <div ref={end} />
        </div>
      )}
      {(tab === "Spec" || tab === "Review") && <pre className="doc">{run?.outputs[tab.toLowerCase()] ?? `No ${tab.toLowerCase()} output yet.`}</pre>}
      {tab === "Diff" && <Diff id={item.id} />}
    </section>
  );
}

function Models({ setError }: { setError: (e: string) => void }) {
  const [config, setConfig] = useState<{ roles: Record<string, RoleConfig> } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setConfig); }, []);
  if (!config) return <p className="empty">Loading…</p>;
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
    <section className="models">
      <table>
        <caption>Model, effort and fallback chain per role. Changes apply to the next stage that starts.</caption>
        <thead>
          <tr><th scope="col">Role</th><th scope="col">Model</th><th scope="col">Effort</th><th scope="col">Fallback chain (on rate limit)</th></tr>
        </thead>
        <tbody>
          {Object.entries(config.roles).map(([role, r]) => (
            <tr key={role}>
              <th scope="row">{role}</th>
              <td>
                <select aria-label={`${role} model`} value={r.model} onChange={(e) => set(role, { model: e.target.value })}>
                  {[...new Set([...MODELS, r.model])].map((m) => <option key={m}>{m}</option>)}
                </select>
              </td>
              <td>
                <select aria-label={`${role} effort`} value={r.effort} onChange={(e) => set(role, { effort: e.target.value })}>
                  {EFFORTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </td>
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

function Gauge({ limit }: { limit: any }) {
  const windows = limit?.unifiedWindows;
  if (!windows) return null;
  return (
    <span className="gauge" title="Claude usage, from the most recent stage">
      {Object.entries(windows as Record<string, { utilization: number; resetsAt: number }>).map(([name, w]) => (
        <label key={name}>
          {name.replace("_", " ")} {Math.round(w.utilization * 100)}%
          <meter value={w.utilization} high={0.8} max={1} />
          <small>resets {new Date(w.resetsAt * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</small>
        </label>
      ))}
    </span>
  );
}

function App() {
  const events = useEvents();
  const { tasks, rateLimit, notice } = useMemo(() => summarize(events), [events]);
  const [backlog, reload] = useBacklog();
  const [view, setView] = useState<(typeof VIEWS)[number]>("Pipeline");
  const [selected, setSelected] = useState<string | null>(null);
  const [stub, setStub] = useState(false);
  const [parallel, setParallel] = useState(1);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const now = useNow(backlog.running.length > 0);
  // A run that failed before it started (bad state, git error) only shows up as this event.
  useEffect(() => { if (notice) setError(`${notice.task}: ${notice.data?.error ?? "command failed"}`); }, [notice?.seq]);

  const act: Act = async (path, body) => {
    const r = await post(path, body);
    setError(r.ok ? "" : r.error);
    reload();
    return r.ok;
  };
  const item = backlog.items.find((i) => i.id === selected);

  return (
    <>
      <header className="top">
        <h1>Software Factory</h1>
        <nav>
          {VIEWS.map((v) => (
            <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{v}</button>
          ))}
        </nav>
        <Gauge limit={rateLimit} />
        <label className="stub" title="Runs the pipeline with canned stage outputs and no model calls">
          <input type="checkbox" checked={stub} onChange={(e) => setStub(e.target.checked)} /> Dry run
        </label>
      </header>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      {view === "Models" && <Models setError={setError} />}
      {view === "Cost" && <Cost events={events} />}
      {view === "Worktrees" && <Worktrees open={(id) => { setSelected(id); setView("Pipeline"); }} discard={(id) => act("/api/discard", { id })} />}
      {view === "Studio" && <Studio setError={setError} />}
      {view === "Graph" && <iframe className="graph" src="/graph" sandbox="allow-scripts" title="Knowledge graph of this repository" />}
      {view === "Pipeline" && (
        <main className={item ? "split" : ""}>
          <div className="board">
            {SECTIONS.map((section) => {
              const items = backlog.items.filter((i) => i.section === section);
              return (
                <section key={section} className="column" aria-label={section}>
                  <h2>{section} <span>{items.length}</span></h2>
                  {section === "Inbox" && (
                    <form onSubmit={async (e) => { e.preventDefault(); if (await act("/api/add", { title })) setTitle(""); }}>
                      <input aria-label="New backlog item" placeholder="Add an item…" value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
                    </form>
                  )}
                  {section === "Ready" && items.length > 0 && (
                    <p className="runnext">
                      <button className="primary" onClick={() => act("/api/run", { parallel, stub })}>Run next</button>
                      <label>× <input type="number" min={1} max={8} value={parallel} aria-label="How many to run in parallel" onChange={(e) => setParallel(Number(e.target.value))} /></label>
                    </p>
                  )}
                  <ul>
                    {items.map((i) => (
                      <Card key={i.id} item={i} run={tasks.get(i.id)} running={backlog.running.includes(i.id)} selected={selected === i.id}
                        now={now} stub={stub} act={act} select={() => setSelected(i.id)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {item && <Detail key={item.id + item.section} item={item} run={tasks.get(item.id)} act={act} close={() => setSelected(null)} />}
        </main>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
