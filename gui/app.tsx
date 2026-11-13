import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { elapsed, passRates, roster, series, STAGES, summarize, toolLine, type Ev, type TaskRun } from "../plugin/engine/state";
import { post, useBacklog, useEvents, useHash, useNow, useTheme, type Backlog, type Item, type Link } from "./data";
import { Agents, Logs, Studio, Worktrees } from "./views";

export type Act = (path: string, body: unknown) => Promise<boolean>;

const VIEWS = ["Overview", "Backlog", "Agents", "Logs", "Worktrees", "Studio", "Graph"] as const;
const SECTIONS = ["Inbox", "Ready", "In progress", "Awaiting approval", "Blocked", "Done"];
const LINK_TEXT: Record<Link, string> = { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", offline: "Offline" };

export function StageStrip({ run }: { run: TaskRun }) {
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

/** One line of a run, in plain words. Shared by the task log, the overview feed and the Logs view. */
export function logLine(e: Ev): { cls: string; text: string } | null {
  const usage = e.data?.usage;
  switch (e.type) {
    case "run.start": return { cls: "head", text: `Run ${e.run} started` };
    case "stage.start": return { cls: "head", text: `${e.stage} started${e.model ? ` · ${e.role} on ${e.model}` : ""}` };
    case "agent.tool": return { cls: "tool", text: toolLine(e.data ?? {}) };
    case "agent.message": return { cls: "msg", text: e.data?.text ?? "" };
    case "agent.rate_limit": return null;
    case "stage.ok": return {
      cls: "ok",
      text: `${e.stage} passed${usage ? ` · $${(usage.costUsd ?? 0).toFixed(4)} · ${usage.turns ?? "?"} turns` : ""}${usage?.denials?.length ? ` · denied: ${usage.denials.join("; ")}` : ""}`,
    };
    case "stage.skipped": return { cls: "head", text: `${e.stage} skipped: ${e.data}` };
    case "stage.rate_limited": return { cls: "warn", text: `Rate limited on ${e.model}; trying the next model in the chain` };
    case "run.done": return { cls: "ok", text: "Review approved. Waiting for a person." };
    case "run.failed": return { cls: "bad", text: `Run failed: ${e.data}` };
    case "task.landed": return { cls: "ok", text: `Landed: ${e.data?.where}` };
    case "task.discarded": return { cls: "warn", text: "Discarded" };
    case "command.failed": return { cls: "bad", text: `Command failed: ${e.data?.error ?? ""}` };
    default:
      return e.type.startsWith("stage.")
        ? { cls: "bad", text: `${e.stage} ${e.type.slice(6)}\n${typeof e.data === "string" ? e.data : e.data?.error ?? ""}` }
        : null;
  }
}

/* ---------- Overview ---------- */

function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi(p: { title: string; value: string; unit?: string; note: string; children?: React.ReactNode }) {
  return (
    <article className="tile kpi">
      <h2>{p.title}</h2>
      <p className="figure">{p.value}{p.unit && <small>{p.unit}</small>}</p>
      <p className="note">{p.note}</p>
      {p.children}
    </article>
  );
}

const WINDOWS = { "1h": { ms: 3_600_000, n: 12, step: "5 min" }, "24h": { ms: 86_400_000, n: 24, step: "hour" }, "7d": { ms: 604_800_000, n: 28, step: "6 hours" } } as const;

/** Stages passed per time bucket, with finished tasks and failures marked. Hover or focus a bar to read it. */
function Throughput({ events, now }: { events: Ev[]; now: number }) {
  const [win, setWin] = useState<keyof typeof WINDOWS>("24h");
  const [at, setAt] = useState<number | null>(null);
  const w = WINDOWS[win];
  const data = useMemo(() => series(events, now - w.ms, now, w.n), [events, win, Math.floor(now / 60_000)]);
  const max = Math.max(1, ...data.map((b) => b.stages));
  const total = data.reduce((sum, b) => sum + b.stages, 0);
  const b = at === null ? null : data[at]!;
  const when = (t: number) => new Date(t).toLocaleString([], win === "7d" ? { weekday: "short", hour: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  return (
    <article className="tile chart">
      <header>
        <h2>Throughput</h2>
        <div className="pills" role="group" aria-label="Time window">
          {(Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]).map((k) => (
            <button key={k} aria-pressed={win === k} onClick={() => { setWin(k); setAt(null); }}>{k}</button>
          ))}
        </div>
      </header>
      <p className="readout" aria-live="polite">
        {b ? <>{when(b.t)}: <b>{b.stages}</b> stages passed, <b>{b.finished}</b> tasks finished, <b>{b.failed}</b> failures, <b>${b.cost.toFixed(3)}</b></>
          : total ? <>{total} stages passed in the last {win}. Each bar is one {w.step}.</>
          : <>No stages have run in the last {win}.</>}
      </p>
      <div className="bars" onMouseLeave={() => setAt(null)}>
        {data.map((d, i) => (
          <button key={d.t} className={`bar${at === i ? " on" : ""}`} onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)}
            aria-label={`${when(d.t)}: ${d.stages} stages passed, ${d.finished} tasks finished, ${d.failed} failures`}>
            <span className="fill" style={{ height: `${(d.stages / max) * 100}%` }} />
            {d.finished > 0 && <span className="mark done" title="A task finished" />}
            {d.failed > 0 && <span className="mark fail" title="A failure" />}
          </button>
        ))}
      </div>
      <p className="axis"><span>{when(data[0]!.t)}</span><span>now</span></p>
      <p className="legend"><span className="key fill" /> stages passed <span className="key done" /> task finished <span className="key fail" /> failure</p>
    </article>
  );
}

/** The factory as a line of five stations, with each task sitting at the station it has reached. */
function Line({ backlog, tasks, open }: { backlog: Backlog; tasks: Map<string, TaskRun>; open: (id: string) => void }) {
  const station = (i: Item): number => {
    if (i.section === "Ready") return 0;
    if (i.section === "Awaiting approval") return 4;
    if (i.section !== "In progress") return -1;
    const active = Object.entries(tasks.get(i.id)?.stages ?? {}).find(([, s]) => s.state === "active")?.[0];
    return active === "build" ? 2 : active === "check" || active === "security" || active === "review" || active === "document" ? 3 : 1;
  };
  const names = ["Queued", "Planning", "Coding", "Testing", "Verified"];
  const hints = ["Ready to run", "Triage and spec", "Build", "Gate and review", "Waiting for your approval"];
  const at = names.map((_, n) => backlog.items.filter((i) => station(i) === n));
  return (
    <article className="tile line">
      <header><h2>Pipeline</h2><p className="note">{backlog.items.filter((i) => i.section === "Done").length} done · {backlog.items.filter((i) => i.section === "Blocked").length} blocked</p></header>
      <ol>
        {names.map((name, n) => (
          <li key={name} className={at[n]!.length ? "busy" : ""}>
            <span className="count">{at[n]!.length}</span>
            <span className="name">{name}</span>
            <span className="hint">{hints[n]}</span>
            <span className="chips">
              {at[n]!.slice(0, 6).map((i) => <button key={i.id} className="chip-id" title={i.title} onClick={() => open(i.id)}>{i.id}</button>)}
              {at[n]!.length > 6 && <span className="more">+{at[n]!.length - 6}</span>}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function Feed({ events, limit, open }: { events: Ev[]; limit: number; open?: (id: string) => void }) {
  const [paused, setPaused] = useState<Ev[] | null>(null);
  const shown = useMemo(() => (paused ?? events).filter((e) => logLine(e)).slice(-limit).reverse(), [paused, events, limit]);
  return (
    <>
      <header>
        <h2>Live activity</h2>
        <button className="quiet" aria-pressed={paused !== null} onClick={() => setPaused(paused ? null : events)}>{paused ? "Resume" : "Pause"}</button>
      </header>
      {/* Newest first. The browser keeps your scroll position anchored when rows arrive above it. */}
      <ol className="feed" aria-live="off">
        {shown.length === 0 && <li className="empty">Nothing has run yet. Promote a backlog item and run it, or tick Dry run to try the pipeline without model calls.</li>}
        {shown.map((e) => {
          const line = logLine(e)!;
          return (
            <li key={e.seq} className={line.cls}>
              <time>{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              {e.task && (open ? <button className="chip-id" onClick={() => open(e.task)}>{e.task}</button> : <span className="chip-id">{e.task}</span>)}
              {e.role && <span className="tag">{e.role}{e.model ? ` · ${e.model}` : ""}</span>}
              <span className="what">{line.text.split("\n")[0]}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Overview(p: { events: Ev[]; tasks: Map<string, TaskRun>; rateLimit: any; backlog: Backlog; open: (id: string) => void }) {
  const working = useMemo(() => roster(p.tasks), [p.tasks]);
  const now = useNow(true, working.length ? 1000 : 30_000);
  const day = useMemo(() => series(p.events, now - 86_400_000, now, 24), [p.events, Math.floor(now / 60_000)]);
  const rates = useMemo(() => passRates(p.events), [p.events]);
  const items = p.backlog.items;
  const done = items.filter((i) => i.section === "Done").length;
  const landed = p.events.filter((e) => e.type === "task.landed" && Date.parse(e.ts) > now - 604_800_000).length;
  const five = p.rateLimit?.unifiedWindows?.five_hour, week = p.rateLimit?.unifiedWindows?.seven_day;
  const pct = (r: { ok: number; total: number }) => (r.total ? `${Math.round((r.ok / r.total) * 100)}` : "–");
  const needsYou = items.filter((i) => i.section === "Awaiting approval" || i.section === "Blocked");

  return (
    <main className="bento">
      <Kpi title="Agents working" value={String(working.length)} note={`${items.filter((i) => i.section === "In progress").length} tasks in progress, ${items.filter((i) => i.section === "Ready").length} ready`}>
        <Spark values={day.map((b) => b.stages)} label="Stages passed per hour, last 24 hours" />
      </Kpi>
      <Kpi title="Backlog done" value={String(done)} unit={` of ${items.length}`} note={`${landed} landed in the last 7 days`}>
        <progress value={done} max={Math.max(1, items.length)} aria-label="Share of backlog items done" />
      </Kpi>
      <Kpi title="Claude usage" value={five ? String(Math.round(five.utilization * 100)) : "–"} unit={five ? "% of 5 hours" : ""}
        note={five ? `${Math.round((week?.utilization ?? 0) * 100)}% of 7 days · resets ${new Date(five.resetsAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · $${day.reduce((s, b) => s + b.cost, 0).toFixed(2)} today` : "A reading appears after the first stage runs."}>
        {five && <meter value={five.utilization} high={0.8} max={1} aria-label="Five-hour usage" />}
      </Kpi>
      <Kpi title="Gate pass rate" value={pct(rates.gate)} unit={rates.gate.total ? "%" : ""} note={rates.review.total ? `Reviews approved ${pct(rates.review)}% of ${rates.review.total}` : "No builds checked yet."}>
        {rates.gate.total > 0 && <meter value={rates.gate.ok / rates.gate.total} low={0.5} optimum={1} max={1} aria-label="Gate pass rate" />}
      </Kpi>

      <Line backlog={p.backlog} tasks={p.tasks} open={p.open} />
      <Throughput events={p.events} now={now} />

      <article className="tile roster">
        <header><h2>Working now</h2></header>
        {working.length === 0 ? <p className="empty">No agents are running.</p> : (
          <table>
            <thead><tr><th scope="col">Task</th><th scope="col">Stage</th><th scope="col">Role and model</th><th scope="col">Running for</th></tr></thead>
            <tbody>
              {working.map((w) => (
                <tr key={w.task}>
                  <td><button className="chip-id" onClick={() => p.open(w.task)}>{w.task}</button></td>
                  <td>{w.stage}</td>
                  <td><span className="tag">{w.role}{w.model ? ` · ${w.model}` : ""}</span></td>
                  <td className="num">{elapsed(w.since, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="tile activity"><Feed events={p.events} limit={60} open={p.open} /></article>

      <article className="tile needs">
        <header><h2>Needs you</h2></header>
        {needsYou.length === 0 ? <p className="empty">Nothing is waiting for you.</p> : (
          <ul>
            {needsYou.map((i) => (
              <li key={i.id}>
                <button className="chip-id" onClick={() => p.open(i.id)}>{i.id}</button>
                <span className="what">{i.title}</span>
                <span className={`badge ${i.section === "Blocked" ? "bad" : "ok"}`}>{i.section === "Blocked" ? "Blocked" : "Review"}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </main>
  );
}

/* ---------- Backlog board and task panel ---------- */

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
    <section className="tile detail" aria-label={`Task ${item.id}`}>
      <header>
        <h2><span className="id">{item.id}</span> {item.title}</h2>
        <button className="quiet" onClick={p.close} aria-label="Close task detail">Close</button>
      </header>
      <nav className="tabs" role="tablist">
        <div className="pills">
          {["Log", "Spec", "Review", "Diff"].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
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

function Board(p: { backlog: Backlog; tasks: Map<string, TaskRun>; act: Act; selected: string | null; select: (id: string | null) => void }) {
  const [stub, setStub] = useState(false);
  const [parallel, setParallel] = useState(1);
  const [title, setTitle] = useState("");
  const now = useNow(p.backlog.running.length > 0);
  const item = p.backlog.items.find((i) => i.id === p.selected);
  return (
    <main className={item ? "split" : ""}>
      <div>
        <p className="toolbar">
          <label title="Runs the pipeline with canned stage outputs and no model calls">
            <input type="checkbox" checked={stub} onChange={(e) => setStub(e.target.checked)} /> Dry run
          </label>
        </p>
        <div className="board">
          {SECTIONS.map((section) => {
            const items = p.backlog.items.filter((i) => i.section === section);
            return (
              <section key={section} className="column" aria-label={section}>
                <h2>{section} <span className="num">{items.length}</span></h2>
                {section === "Inbox" && (
                  <form onSubmit={async (e) => { e.preventDefault(); if (await p.act("/api/add", { title })) setTitle(""); }}>
                    <input aria-label="New backlog item" placeholder="Add an item…" value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
                  </form>
                )}
                {section === "Ready" && items.length > 0 && (
                  <p className="runnext">
                    <button className="primary" onClick={() => p.act("/api/run", { parallel, stub })}>Run next</button>
                    <label>× <input type="number" min={1} max={8} value={parallel} aria-label="How many to run in parallel" onChange={(e) => setParallel(Number(e.target.value))} /></label>
                  </p>
                )}
                <ul>
                  {items.map((i) => (
                    <Card key={i.id} item={i} run={p.tasks.get(i.id)} running={p.backlog.running.includes(i.id)} selected={p.selected === i.id}
                      now={now} stub={stub} act={p.act} select={() => p.select(i.id)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {item && <Detail key={item.id + item.section} item={item} run={p.tasks.get(item.id)} act={p.act} close={() => p.select(null)} />}
    </main>
  );
}

/* ---------- Shell ---------- */

function App() {
  const { events, link } = useEvents();
  const { tasks, rateLimit, notice } = useMemo(() => summarize(events), [events]);
  const { backlog, loaded, reload } = useBacklog();
  const [view, setView] = useHash(VIEWS);
  const [theme, toggleTheme] = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  // A run that failed before it started (bad state, git error) only shows up as this event.
  useEffect(() => { if (notice) setError(`${notice.task}: ${notice.data?.error ?? "command failed"}`); }, [notice?.seq]);

  const act: Act = async (path, body) => {
    const r = await post(path, body);
    setError(r.ok ? "" : r.error);
    reload();
    return r.ok;
  };
  const open = (id: string) => { setSelected(id); setView("Backlog"); };

  return (
    <>
      <header className="top">
        <h1>Software Factory</h1>
        <nav className="pills" aria-label="Views">
          {VIEWS.map((v) => <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{v}</button>)}
        </nav>
        <span className={`link ${link}`} role="status" title="The live event stream from the factory server">{LINK_TEXT[link]}</span>
        <button className="quiet theme" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      {link === "offline" && <p className="error" role="alert">The factory server is not answering, so this page is showing what it last received. It retries every 5 seconds. Start it again with <code>factory serve</code>.</p>}
      {error && <p className="error" role="alert">{error} <button className="quiet" onClick={() => setError("")}>Dismiss</button></p>}
      {!loaded ? <p className="empty loading">Loading the backlog…</p> : (
        <>
          {view === "Overview" && <Overview events={events} tasks={tasks} rateLimit={rateLimit} backlog={backlog} open={open} />}
          {view === "Backlog" && <Board backlog={backlog} tasks={tasks} act={act} selected={selected} select={setSelected} />}
          {view === "Agents" && <Agents events={events} tasks={tasks} setError={setError} open={open} />}
          {view === "Logs" && <Logs events={events} />}
          {view === "Worktrees" && <main className="stack"><Worktrees open={open} discard={(id) => act("/api/discard", { id })} /></main>}
          {view === "Studio" && <Studio setError={setError} />}
          {view === "Graph" && <iframe className="graph" src="/graph" sandbox="allow-scripts" title="Knowledge graph of this repository" />}
        </>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
