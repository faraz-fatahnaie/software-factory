// The Backlog: a board of what is queued, running, waiting for you and done, and a side panel for one task (its pipeline, live activity,
// documents and changes). Everything is derived from the backlog and the event log; the buttons call the same endpoints as the command line.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { elapsed, liveOf, STAGES, summarize, doing, type Ev, type TaskRun } from "../plugin/engine/state";
import { agoShort } from "./commitgraph";
import { useNow, type Backlog as Data, type Item } from "./data";
import { FileTree, parseUnified, Stat, UnifiedLines, type FileItem } from "./diff";
import { Icon } from "./icons";
import { splitDiff, type DiffFile } from "./linediff";
import { NowLine } from "./live";
import { PersonLink } from "./person";
import { personaFor, Robot } from "./robots";
import { Markdown } from "./studio";
import { Select } from "./ui";

type Act = (path: string, body: unknown) => Promise<boolean>;
const COLUMNS = [["Inbox", "Inbox"], ["Ready", "Ready"], ["In progress", "In progress"], ["Awaiting approval", "Needs you"], ["Done", "Done"]] as const;
const STATION: Record<string, string> = { triage: "Triage", spec: "Spec", build: "Build", check: "Check", security: "Security", review: "Review", document: "Summary" };
const DOING: Record<string, string> = { triage: "Triaging", spec: "Writing the spec", build: "Building", check: "Running the checks", security: "Checking security", review: "Reviewing", document: "Writing the summary" };
const TRACK = ["spec", "build", "check", "review", "document"];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const money = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** When each stage started, how long it took and what it cost, from the run's events. */
function stageFacts(run: TaskRun | undefined) {
  const out = new Map<string, { start?: string; ms?: number; cost: number }>();
  for (const e of run?.events ?? []) {
    const f = out.get(e.stage) ?? { cost: 0 };
    if (e.type === "stage.start") f.start = e.ts;
    else if (e.type.startsWith("stage.") && f.start) { f.ms = Date.parse(e.ts) - Date.parse(f.start); f.cost += e.data?.usage?.costUsd ?? 0; }
    out.set(e.stage, f);
  }
  return out;
}
const took = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? "<1s" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`);
const activeOf = (run?: TaskRun) => (run?.status === "running" ? Object.entries(run.stages).find(([, s]) => s.state === "active") : undefined);

/** The branch's diff, fetched once per task and kept: the cards of tasks waiting for you show its size. */
const diffs = new Map<string, Promise<DiffFile[] | null>>();
function useDiff(id: string, fresh: string, enabled = true): DiffFile[] | null | undefined {
  const [files, setFiles] = useState<DiffFile[] | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const key = `${id}:${fresh}`;
    if (!diffs.has(key)) diffs.set(key, fetch(`/api/diff?id=${id}`).then(async (r) => (r.ok ? splitDiff(await r.text()) : null)).catch(() => null));
    let live = true;
    diffs.get(key)!.then((f) => live && setFiles(f));
    return () => { live = false; };
  }, [id, fresh, enabled]);
  return files;
}

const verdictOf = (run?: TaskRun) => {
  const text = run?.outputs.review;
  if (!text) return null;
  const head = text.trim().split("\n")[0]!;
  return { ok: /^APPROVE/i.test(head), head: head.replace(/^(APPROVE|REQUEST[_ ]CHANGES|CHANGES)[:\s-]*/i, "").trim(), who: Object.values(run!.stages).find((s) => s.role === "reviewer")?.role ?? "reviewer" };
};

// ---------------------------------------------------------------------------------------------------------------- Cards

function Prio({ p }: { p?: string }) { return p ? <span className="tag">{p}</span> : null; }

function TaskCard(p: { openPerson?: (role: string) => void; item: Item; run?: TaskRun; running: boolean; selected: boolean; now: number; stub: boolean; first: boolean; act: Act; open: () => void; landed?: string }) {
  const { item, run, act } = p;
  const id = { id: item.id }, active = activeOf(run), sec = item.section;
  const files = useDiff(item.id, run?.run ?? "", sec === "Awaiting approval");
  const verdict = sec === "Awaiting approval" ? verdictOf(run) : null;
  const [asking, setAsking] = useState(false);
  const live = active ? liveOf(run, active[0]).now : null;
  const track = TRACK.map((s) => run?.stages[s]?.state);
  return (
    <li className={`bcard ${sec === "Awaiting approval" ? "you" : active ? "live" : ""}${p.selected ? " selected" : ""}`} data-card={item.id}>
      <button className="open" onClick={p.open} aria-pressed={p.selected}>
        <span className="top"><span className="idc">{item.id}</span><Prio p={item.prio} />{active && <span className="state"><i className="pulse" aria-hidden="true" />{DOING[active[0]]}</span>}{p.first && sec === "Ready" && <span className="state quiet">Runs first</span>}</span>
        <span className="title">{item.title}</span>
      </button>
      {active && live && (
        <div className="who">
          <PersonLink role={active[1].role ?? "gate"} open={active[1].role ? p.openPerson : undefined}><Robot role={active[1].role ?? "gate"} size={28} /></PersonLink>
          <span><b>{active[1].role ? personaFor(active[1].role).name : "The gate"}</b><span className="note">{active[0] === "check" ? "Running the project's checks" : <>{live.verb} {live.what && <code>{live.what}</code>}</>}</span></span>
        </div>
      )}
      {(active || (run && sec === "Blocked")) && (
        <>
          <div className="track" role="img" aria-label={TRACK.map((s, i) => `${STATION[s]} ${track[i] ?? "waiting"}`).join(", ")}>
            {track.map((s, i) => <i key={i} className={s === "ok" || s === "skipped" ? "ok" : s === "active" ? "cur" : s === "failed" || s === "limited" ? "bad" : ""} />)}
          </div>
          <p className="note split-line"><span>{active ? `${STATION[active[0]]} · step ${Math.max(1, track.findIndex((s) => s === "active") + 1)} of ${TRACK.length}` : ""}</span><span>{run && elapsed(run.started, p.now)}{run && run.cost > 0 ? ` · ${money(run.cost)}` : ""}</span></p>
        </>
      )}
      {sec === "Awaiting approval" && (
        <>
          {verdict && <p className={`verdict${verdict.ok ? " ok" : ""}`}><Icon name={verdict.ok ? "check" : "x"} size={15} />{verdict.ok ? "Reviewer approved" : "Changes requested"}</p>}
          <p className="note">{files ? <>{plural(files.length, "file")} · <Stat added={files.reduce((s, f) => s + f.added, 0)} removed={files.reduce((s, f) => s + f.removed, 0)} /></> : "Counting the changes…"}{run ? ` · ${elapsed(run.started, Date.parse(run.ended ?? new Date(p.now).toISOString()))} · ${money(run.cost)}` : ""}</p>
        </>
      )}
      {sec === "Done" ? null : asking ? (
        <div className="ask" role="alert">
          <b>Throw away the work on {item.id}?</b><span className="note">Its branch and worktree are deleted. This cannot be undone.</span>
          <span className="row gap"><button onClick={() => setAsking(false)}>Keep it</button><button className="danger-btn" onClick={() => act("/api/discard", id)}>Delete the work</button></span>
        </div>
      ) : (
        <div className="actions">
          {sec === "Inbox" && <button onClick={() => act("/api/promote", id)}>Promote to Ready</button>}
          {sec === "Ready" && <button onClick={() => act("/api/run", { ids: [item.id], stub: p.stub })}>Run</button>}
          {p.running && <button className="danger" onClick={() => act("/api/stop", id)}>Stop</button>}
          {sec === "Awaiting approval" && <button className="primary" onClick={p.open}>Review changes</button>}
        </div>
      )}
    </li>
  );
}

function DoneRow({ item, landed, selected, open }: { item: Item; landed?: string; selected: boolean; open: () => void }) {
  return (
    <li className={`done-row${selected ? " selected" : ""}`} data-card={item.id}>
      <button className="open" onClick={open} aria-pressed={selected}><Icon name="check" size={14} /><span className="idc">{item.id}</span><span className="t">{item.title}</span>{landed && <span className="note">{agoShort(landed)}</span>}</button>
    </li>
  );
}

/** A column with nothing in it says what belongs there. */
const EMPTY: Record<string, [string, string]> = {
  Inbox: ["Nothing here", "Add an idea and it waits here until you promote it."],
  Ready: ["Nothing ready", "Promote an item from Inbox, then run it."],
  "In progress": ["Nobody is working", "Run a ready item and you can watch it here."],
  "Awaiting approval": ["Nothing needs you", "When a task is ready for your decision, it waits here."],
  Done: ["Nothing done yet", "Approved work is listed here."],
};

// ---------------------------------------------------------------------------------------------------------------- The side panel

type Tab = "Summary" | "Activity" | "Spec" | "Review" | "Changes";
const TABS: Tab[] = ["Summary", "Activity", "Spec", "Review", "Changes"];

function Stepper({ run, facts, pick }: { run?: TaskRun; facts: ReturnType<typeof stageFacts>; pick: (stage: string) => void }) {
  const idx = STAGES.reduce((n, s, i) => (run?.stages[s] ? i : n), -1);
  const firstWaiting = STAGES.findIndex((s, i) => i > idx && !run?.stages[s]);
  return (
    <ol className="stepper" aria-label="Pipeline stages">
      <span className="line" aria-hidden="true"><i style={{ width: `${Math.max(0, idx) / (STAGES.length - 1) * 100}%` }} /></span>
      {STAGES.map((s, i) => {
        const st = run?.stages[s], f = facts.get(s);
        const state = st?.state ?? (i < idx ? "skipped" : "pending");
        return (
          <li key={s} className={`st ${state}`}>
            <button onClick={() => pick(s)} title="Show its activity" aria-current={state === "active" ? "step" : undefined}>
              <span className="ring" aria-hidden="true">{st?.role ? <Robot role={st.role} size={28} /> : <span className="n">{s === "check" ? <Icon name="check" size={15} /> : i + 1}</span>}</span>
              <b>{STATION[s]}<span className="sr">, {state === "pending" ? "not started" : state}</span></b>
              <span className="t">{state === "skipped" ? (st ? "skipped" : "not needed") : state === "active" ? took(Date.now() - Date.parse(st?.since ?? new Date().toISOString())) : f?.ms !== undefined ? took(f.ms) : i === firstWaiting && run?.status === "running" ? "next" : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Activity({ run, focus, shownEvents, live }: { run?: TaskRun; focus: string; shownEvents: Ev[]; live: boolean }) {
  const [kind, setKind] = useState<"all" | "files" | "commands" | "said">("all");
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => { if (follow && live) box.current?.scrollTo({ top: box.current.scrollHeight }); }, [shownEvents.length, follow, live]);
  if (!run) return <p className="empty">No run is recorded for this task yet.</p>;
  const keep = (e: Ev) => kind === "all" || (kind === "files" ? e.type === "agent.tool" && e.data?.tool !== "Bash" : kind === "commands" ? e.type === "agent.tool" && e.data?.tool === "Bash" : e.type === "agent.message");
  const stages = STAGES.filter((s) => shownEvents.some((e) => e.stage === s));
  return (
    <>
      <div className="row gap wrap bk-filter">
        <div className="pills" role="group" aria-label="Show">
          {([["all", "Everything"], ["files", "Files"], ["commands", "Commands"], ["said", "Said"]] as const).map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        {live && !follow && <button className="primary sm" onClick={() => { setFollow(true); box.current?.scrollTo({ top: box.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" }); }}>Jump to latest</button>}
      </div>
      <div className="bk-activity" ref={box} role="log" aria-label="Activity" onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24); }}>
        {stages.map((s) => {
          const mine = shownEvents.filter((e) => e.stage === s && keep(e) && e.type !== "stage.start");
          const st = run.stages[s];
          return (
            <details key={s} open={!focus || focus === s}>
              <summary><b>{STATION[s]}</b>{st?.role && <span className="note">{personaFor(st.role).name}{st.model ? ` · ${st.model}` : ""}</span>}<span className={`badge ${st?.state === "ok" ? "ok" : st?.state === "failed" ? "bad" : ""}`}>{st?.state === "active" ? "working" : st?.state ?? ""}</span></summary>
              <ol>
                {mine.length === 0 && <li className="note">Nothing of this kind in this stage.</li>}
                {mine.map((e) => {
                  const d = e.type === "agent.tool" ? doing(e.data ?? {}) : null;
                  return (
                    <li key={e.seq} className={e.type === "agent.message" ? "said" : e.type === "stage.failed" || e.type === "stage.error" ? "bad" : e.type === "stage.ok" ? "ok" : ""}>
                      <time dateTime={e.ts}>{clock(e.ts)}</time>
                      <span>
                        {d ? <><b>{d.verb}</b> {d.what && <code>{d.what}</code>}</> : e.type === "agent.message" ? <>“{String(e.data?.text ?? "").slice(0, 400)}”</>
                          : e.type === "stage.ok" ? <>Passed{e.data?.usage ? ` · ${money(e.data.usage.costUsd ?? 0)} · ${e.data.usage.turns ?? "?"} turns` : ""}</>
                          : e.type === "stage.skipped" ? <>Skipped: {String(e.data)}</> : e.type === "stage.failed" || e.type === "stage.error" ? <>Failed: <code>{String(typeof e.data === "string" ? e.data : e.data?.error ?? "").split("\n")[0]!.slice(0, 200)}</code></>
                          : e.type === "stage.rate_limited" ? <>Rate limited on {e.model}; trying the next model</> : e.type}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </details>
          );
        })}
      </div>
    </>
  );
}

function Changes({ item, run }: { item: Item; run?: TaskRun }) {
  const landed = item.section === "Done" || item.section === "Inbox";
  const files = useDiff(item.id, run?.run ?? "", !landed);
  const [path, setPath] = useState("");
  useEffect(() => { if (files?.length && !files.some((f) => f.path === path)) setPath(files[0]!.path); }, [files]);
  if (landed) return <p className="empty">{item.section === "Done" ? "This work has landed on main. Find it in Source." : "Nothing has been built yet."}</p>;
  if (files === undefined) return <p className="empty">Loading the changes…</p>;
  if (!files || files.length === 0) return <p className="empty">{files === null ? "There is no branch for this task yet." : "No changes on this branch."}</p>;
  const cur = files.find((f) => f.path === path) ?? files[0]!;
  const items: FileItem[] = files.map((f) => ({ path: f.path, status: f.status === "R" ? "R" : f.status, added: f.added, removed: f.removed }));
  return (
    <div className="bk-changes">
      <div className="files">
        <p className="note split-line"><span>{plural(files.length, "file")}</span><Stat added={files.reduce((s, f) => s + f.added, 0)} removed={files.reduce((s, f) => s + f.removed, 0)} /></p>
        <FileTree files={items} picked={cur.path} onPick={setPath} label={`Files changed in ${item.id}`} />
      </div>
      <div className="diff-view">
        <header><span className="path">{cur.path}</span><Stat added={cur.added} removed={cur.removed} /></header>
        {(() => { const parsed = parseUnified(cur.text); return parsed.binary ? <p className="empty">A binary file changed.</p> : parsed.lines.length ? <div className="scroll"><UnifiedLines lines={parsed.lines} /></div> : <p className="empty">No lines changed (a rename or a permission change).</p>; })()}
      </div>
    </div>
  );
}

function Panel(p: { item: Item; run?: TaskRun; events: Ev[]; now: number; stub: boolean; act: Act; close: () => void; step: (d: number) => void }) {
  const { item, run, act } = p;
  const sec = item.section, awaiting = sec === "Awaiting approval", active = activeOf(run);
  const [tab, setTab] = useState<Tab>(awaiting ? "Changes" : "Summary");
  const [focus, setFocus] = useState("");
  const [wide, setWide] = useState(false);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [upTo, setUpTo] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  const all = run?.events ?? [];
  const shown = upTo === null ? all : all.slice(0, upTo);
  const then = upTo === null ? run : summarize(shown).tasks.get(item.id);
  const facts = useMemo(() => stageFacts(then), [then?.events.length, then]);
  const files = useDiff(item.id, run?.run ?? "", awaiting);
  useEffect(() => { setTab(awaiting ? "Changes" : "Summary"); setFocus(""); setAsking(false); setUpTo(null); setReplay(false); head.current?.focus({ preventScroll: true }); }, [item.id, awaiting]);
  const close = () => { if (reduced()) return p.close(); setLeaving(true); setTimeout(p.close, 170); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, [role=listbox]")) return;
      if (/^[1-5]$/.test(e.key)) setTab(TABS[Number(e.key) - 1]!);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const verdict = verdictOf(run);
  const failed = run && Object.entries(run.stages).find(([, s]) => s.state === "failed");
  const failure = [...all].reverse().find((e) => e.type === "stage.failed" || e.type === "stage.error");
  const status = active ? { text: `${DOING[active[0]]} · ${elapsed(run!.started, p.now)}`, cls: "live" } : awaiting ? { text: "Ready for your decision", cls: "ok" } : sec === "Blocked" ? { text: "Blocked", cls: "bad" } : sec === "Done" ? { text: "Done", cls: "ok" } : { text: sec === "Ready" ? "Ready to run" : "In the inbox", cls: "" };
  const models = [...new Set(Object.values(run?.stages ?? {}).map((s) => s.model).filter(Boolean))];
  const next = awaiting ? "Nothing lands until you approve it." : active ? "When this stage finishes the next one starts by itself. You decide at the end. Nothing lands without you." : sec === "Ready" ? "Run it to start the pipeline." : sec === "Inbox" ? "Promote it to Ready when you want it built." : sec === "Blocked" ? "Retry after you have looked at what went wrong, or discard the work." : "";

  return createPortal(
    <div className={`bk-layer${leaving ? " out" : ""}`}>
      <div className="bk-scrim" onClick={close} />
      <aside className={`bk-panel${wide ? " wide" : ""}`} role="dialog" aria-modal="false" aria-label={`Task ${item.id}`}>
        <div className="bk-bar">
          <span className="note">Backlog <span aria-hidden="true">›</span> {sec === "Awaiting approval" ? "Needs you" : sec}</span>
          <span className="row gap-s">
            <button className="icon" aria-label="Previous task (K)" onClick={() => p.step(-1)}><Icon name="up" size={16} /></button>
            <button className="icon" aria-label="Next task (J)" onClick={() => p.step(1)}><Icon name="down" size={16} /></button>
            <button className="icon" aria-label={wide ? "Make the panel narrower" : "Open full width"} aria-pressed={wide} onClick={() => setWide(!wide)}><Icon name="expand" size={16} /></button>
            <button className="icon" aria-label="Close (Esc)" onClick={close}><Icon name="x" size={16} /></button>
          </span>
        </div>
        <header className="bk-head">
          <div className="row gap wrap"><span className="idc">{item.id}</span><Prio p={item.prio} /><span className={`bk-status ${status.cls}`}>{status.cls === "live" && <i className="pulse" aria-hidden="true" />}{status.cls === "ok" && <Icon name="check" size={15} />}{status.text}</span></div>
          <div className="row between wrap">
            <h2 ref={head} tabIndex={-1}>{item.title}</h2>
            <span className="row gap">
              {sec === "Ready" && <button onClick={() => act("/api/run", { ids: [item.id], stub: p.stub })}>Run</button>}
              {sec === "Blocked" && <button onClick={() => act("/api/run", { ids: [item.id], stub: p.stub })}>Retry</button>}
              {p.item.section === "In progress" && run?.status === "running" && <button className="danger" onClick={() => act("/api/stop", { id: item.id })}>Stop</button>}
              {sec === "Inbox" && <button onClick={() => act("/api/promote", { id: item.id })}>Promote to Ready</button>}
              {sec === "Blocked" && !asking && <button className="danger" onClick={() => setAsking(true)}>Discard</button>}
            </span>
          </div>
          {asking && sec === "Blocked" && <div className="ask" role="alert"><b>Throw away the work on {item.id}?</b><span className="note">Its branch and worktree are deleted. This cannot be undone.</span><span className="row gap"><button onClick={() => setAsking(false)}>Keep it</button><button className="danger-btn" onClick={async () => { if (await act("/api/discard", { id: item.id })) close(); }}>Delete the work</button></span></div>}
        </header>
        {run && <Stepper run={then} facts={facts} pick={(s) => { setTab("Activity"); setFocus(s); }} />}
        <div className="bk-tabs" role="tablist" aria-label="Task views">
          {TABS.map((t, i) => (
            <button key={t} role="tab" aria-selected={tab === t} aria-keyshortcuts={String(i + 1)} onClick={() => { setTab(t); if (t !== "Activity") setFocus(""); }}>
              {t}{t === "Activity" && all.length > 0 && <span className="n">{all.filter((e) => e.type.startsWith("agent.")).length}</span>}{t === "Changes" && files && files.length > 0 && <span className="n">{files.length}</span>}
            </button>
          ))}
        </div>

        <div className="bk-body" key={tab} role="tabpanel">
          {tab === "Summary" && (
            <>
              {active && <section className="bk-card live" aria-label="What is happening now"><NowLine run={run} stage={active[0]} since={active[1].since ?? run!.started} now={p.now} /></section>}
              {sec === "Blocked" && (failure || run?.error) && (
                <section className="bk-card bad" aria-label="What went wrong">
                  <h3>{failed ? `${STATION[failed[0]]} failed` : "It stopped"}</h3>
                  <pre>{String(typeof failure?.data === "string" ? failure.data : failure?.data?.error ?? run?.error ?? "").split("\n").slice(0, 14).join("\n")}</pre>
                </section>
              )}
              {verdict && <section className={`bk-card ${verdict.ok ? "ok" : "bad"}`} aria-label="The review"><h3>{verdict.ok ? "The reviewer approved it" : "The reviewer asked for changes"}</h3>{verdict.head && <p>{verdict.head}</p>}<button className="quiet" onClick={() => setTab("Review")}>Read the full review</button></section>}
              {item.detail && <section aria-label="About this task"><h3>About this task</h3><p className="bk-detail">{item.detail}</p></section>}
              <dl className="bk-facts">
                {run && <div><dt>Started</dt><dd>{agoShort(run.started)} ago</dd></div>}
                {run && <div><dt>Cost</dt><dd>{money(run.cost)}</dd></div>}
                {models.length > 0 && <div><dt>Models</dt><dd>{models.join(" · ")}</dd></div>}
                {run && <div><dt>Branch</dt><dd><code>factory/{item.id}</code></dd></div>}
                {run && <div><dt>Worktree</dt><dd><code>.worktrees/{item.id}</code></dd></div>}
                {run && <div><dt>Run</dt><dd><code>{run.run.slice(0, 8)}</code></dd></div>}
              </dl>
              {next && <p className="note">{next}</p>}
            </>
          )}
          {tab === "Activity" && (
            <>
              {all.length > 1 && (
                <div className="bk-replay">
                  <button aria-pressed={replay} onClick={() => { setReplay(!replay); setUpTo(null); }}>Replay</button>
                  {replay && <><input type="range" aria-label="Replay position" min={1} max={all.length} value={upTo ?? all.length} onChange={(e) => setUpTo(Number(e.target.value) >= all.length ? null : Number(e.target.value))} /><span className="note">{upTo === null ? "live" : `event ${upTo} of ${all.length} · ${clock(shown.at(-1)!.ts)}`}</span></>}
                </div>
              )}
              <Activity run={run} focus={focus} shownEvents={shown} live={upTo === null && run?.status === "running"} />
            </>
          )}
          {(tab === "Spec" || tab === "Review") && (
            run?.outputs[tab.toLowerCase()] ? <div className="bk-doc"><Markdown text={run.outputs[tab.toLowerCase()]!} /></div>
              : <p className="empty">{tab === "Spec" ? "The spec appears here when the architect has written it." : "The review appears here when the reviewer has finished."}</p>
          )}
          {tab === "Changes" && <Changes item={item} run={run} />}
        </div>

        {awaiting && (
          <footer className="bk-foot">
            {asking ? (
              <div className="ask" role="alert"><b>Throw away the work on {item.id}?</b><span className="note">Its branch and worktree are deleted. This cannot be undone.</span><span className="row gap"><button onClick={() => setAsking(false)}>Keep it</button><button className="danger-btn" onClick={async () => { if (await act("/api/discard", { id: item.id })) close(); }}>Delete the work</button></span></div>
            ) : (
              <>
                <button className="danger" onClick={() => setAsking(true)}>Discard this work</button>
                <span className="grow" />
                <span className="note">Approving merges it into main here. With GitHub connected it stays on its branch until you push.</span>
                <button className="primary" onClick={async () => { if (await act("/api/approve", { id: item.id })) close(); }}>Approve and land</button>
              </>
            )}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------------------------------------------- The board

export function BacklogView(p: { openPerson?: (role: string) => void; backlog: Data; tasks: Map<string, TaskRun>; events: Ev[]; act: Act; selected: string | null; select: (id: string | null) => void }) {
  const [stub, setStub] = useState(false);
  const [parallel, setParallel] = useState("1");
  const [query, setQuery] = useState("");
  const [prio, setPrio] = useState("All");
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [newPrio, setNewPrio] = useState("");
  const [detail, setDetail] = useState("");
  const [moreDone, setMoreDone] = useState(false);
  const [asking, setAsking] = useState("");
  const now = useNow(p.backlog.running.length > 0);
  const filter = useRef<HTMLInputElement>(null);
  useEffect(() => { const open = () => setComposing(true); window.addEventListener("sf:add", open); return () => window.removeEventListener("sf:add", open); }, []);
  const board = useRef<HTMLDivElement>(null);
  const landed = useMemo(() => { const m = new Map<string, string>(); for (const e of p.events) if (e.type === "task.landed") m.set(e.task, e.ts); return m; }, [p.events]);

  const q = query.trim().toLowerCase();
  const match = (i: Item) => (prio === "All" || i.prio === prio) && (!q || `${i.id} ${i.title} ${i.detail ?? ""}`.toLowerCase().includes(q));
  const shown = p.backlog.items.filter(match);
  const by = (section: string) => shown.filter((i) => i.section === section);
  const done = by("Done").slice().reverse();
  const doneShown = moreDone || q ? done : done.slice(0, 5);
  const blocked = by("Blocked");
  const order = [...by("Inbox"), ...by("Ready"), ...by("In progress"), ...by("Awaiting approval"), ...doneShown];
  const item = p.backlog.items.find((i) => i.id === p.selected);

  // Cards that change column glide to their new place instead of jumping.
  const rects = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    if (!board.current) return;
    const base = board.current.getBoundingClientRect(), next = new Map<string, { x: number; y: number }>();
    board.current.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
      const r = el.getBoundingClientRect(), pos = { x: r.left - base.left, y: r.top - base.top }, was = rects.current.get(el.dataset.card!);
      next.set(el.dataset.card!, pos);
      if (was && !reduced() && (Math.abs(was.x - pos.x) > 4 || Math.abs(was.y - pos.y) > 4)) el.animate([{ transform: `translate(${was.x - pos.x}px, ${was.y - pos.y}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" });
    });
    rects.current = next;
  });

  const step = (d: number) => { const i = order.findIndex((x) => x.id === p.selected); const n = order[Math.max(0, Math.min(order.length - 1, i + d))]; if (n) p.select(n.id); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = !!t.closest("input, textarea, [contenteditable], [role=listbox]");
      if (e.key === "Escape") { if (composing) { setComposing(false); return; } if (asking) { setAsking(""); return; } if (p.selected && !t.closest("input, textarea, [role=listbox]")) p.select(null); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); filter.current?.focus(); }
      else if (e.key === "n") { e.preventDefault(); setComposing(true); }
      else if ((e.key === "j" || e.key === "k") && order.length) { e.preventDefault(); const was = p.selected; step(e.key === "j" ? 1 : -1); if (!was) p.select(order[0]!.id); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  // Closing the panel hands focus back to the card that opened it.
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (p.selected) last.current = p.selected;
    else if (last.current) { document.querySelector<HTMLElement>(`[data-card="${last.current}"] .open`)?.focus({ preventScroll: true }); last.current = null; }
  }, [p.selected]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await p.act("/api/add", { title, ...(newPrio ? { prio: newPrio } : {}), ...(detail.trim() ? { detail } : {}) })) { setTitle(""); setDetail(""); setNewPrio(""); setComposing(false); }
  };
  const total = p.backlog.items.length;

  return (
    <div className="backlog">
      <div className="bk-tools">
        <label className="field-box grow-s">
          <Icon name="search" size={15} />
          <input ref={filter} type="text" aria-label="Filter tasks" placeholder="Filter tasks   /" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setQuery(""); e.currentTarget.blur(); } }} />
          {query && <button type="button" className="quiet clear" aria-label="Clear filter" onClick={() => setQuery("")}><Icon name="x" size={14} /></button>}
        </label>
        <div className="pills" role="group" aria-label="Priority">{["All", "P1", "P2", "P3"].map((x) => <button key={x} aria-pressed={prio === x} onClick={() => setPrio(x)}>{x}</button>)}</div>
        <span className="grow" />
        <label className="switch" title="Runs the pipeline with canned stage outputs and no model calls"><input type="checkbox" role="switch" checked={stub} onChange={(e) => setStub(e.target.checked)} /><span>Dry run</span></label>
        <button className="primary" onClick={() => setComposing(true)}><Icon name="plus" size={14} /> Add item</button>
      </div>

      {blocked.length > 0 && (
        <div className="bk-blocked" role="alert">
          {blocked.map((b) => {
            const run = p.tasks.get(b.id), failed = run && Object.entries(run.stages).find(([, s]) => s.state === "failed"), role = failed?.[1].role;
            const why = String(run?.error ?? "").split("\n")[0] || (failed ? `${STATION[failed[0]]} failed.` : "It stopped.");
            return (
              <div key={b.id} className="row between wrap">
                <span className="row gap"><Robot role={role ?? "tester"} size={32} /><span><b>{blocked.length === 1 ? "1 task is blocked" : "Blocked"}</b> <span className="idc">{b.id}</span> {b.title}<span className="note block">{role ? `${personaFor(role).name}: ` : ""}{why.slice(0, 140)}</span></span></span>
                {asking === b.id ? (
                  <span className="row gap"><b>Throw away the work?</b><button onClick={() => setAsking("")}>Keep it</button><button className="danger-btn" onClick={() => p.act("/api/discard", { id: b.id })}>Delete the work</button></span>
                ) : (
                  <span className="row gap"><button onClick={() => p.select(b.id)}>Look into it</button><button onClick={() => p.act("/api/run", { ids: [b.id], stub })}>Retry</button><button className="danger" onClick={() => setAsking(b.id)}>Discard</button></span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bk-board" ref={board}>
        {COLUMNS.map(([section, label]) => {
          const items = section === "Done" ? doneShown : by(section);
          const count = section === "Done" ? done.length : items.length;
          return (
            <section key={section} className={`bk-col${section === "Awaiting approval" ? " you" : ""}`} aria-label={label}>
              <header>
                <h2>{label} <span className={`count${section === "Awaiting approval" && count ? " hot" : ""}`}>{count}</span></h2>
              </header>
              {section === "Ready" && by("Ready").length > 0 && (
                <span className="split-btn">
                  <button className="primary" onClick={() => p.act("/api/run", { parallel: Number(parallel), stub })}>Run next</button>
                  <Select small label="How many to run at once" value={parallel} options={["1", "2", "3", "4"].map((n) => ({ value: n, label: `×${n}`, hint: n === "1" ? "One at a time" : `${n} at once, each in its own worktree` }))} onChange={setParallel} align="right" />
                </span>
                )}
              {section === "Inbox" && composing && (
                <form className="composer" onSubmit={add}>
                  <label>What should be built?<input autoFocus value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} /></label>
                  <div className="row gap-s wrap"><span className="note">Priority</span><div className="pills" role="group" aria-label="New item priority">{["P1", "P2", "P3"].map((x) => <button type="button" key={x} aria-pressed={newPrio === x} onClick={() => setNewPrio(newPrio === x ? "" : x)}>{x}</button>)}</div></div>
                  <label>Description <span className="note">(optional)</span><textarea rows={3} maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What does done look like?" /></label>
                  <div className="row gap wrap"><button className="primary">Add to Inbox</button><button type="button" className="quiet" onClick={() => setComposing(false)}>Cancel</button><span className="note grow">Enter adds · Esc cancels</span></div>
                </form>
              )}
              {items.length === 0 && !(section === "Inbox" && composing) ? (
                <div className="bk-empty">{section === "Awaiting approval" && <Icon name="check" size={20} />}<b>{q || prio !== "All" ? "No match" : EMPTY[section]![0]}</b><span className="note">{q || prio !== "All" ? "Nothing here matches the filter." : EMPTY[section]![1]}</span>{section === "Inbox" && !q && prio === "All" && <button onClick={() => setComposing(true)}>Add item</button>}</div>
              ) : section === "Done" ? (
                <ul className="done-list">{items.map((i) => <DoneRow key={i.id} item={i} landed={landed.get(i.id)} selected={p.selected === i.id} open={() => p.select(i.id)} />)}</ul>
              ) : (
                <ul>{items.map((i, k) => <TaskCard key={i.id} openPerson={p.openPerson} item={i} run={p.tasks.get(i.id)} running={p.backlog.running.includes(i.id)} selected={p.selected === i.id} now={now} stub={stub} first={k === 0} act={p.act} open={() => p.select(i.id)} />)}</ul>
              )}
              {section === "Done" && done.length > 5 && !q && <button className="quiet" onClick={() => setMoreDone(!moreDone)}>{moreDone ? "Show fewer" : `Show ${done.length - 5} more`}</button>}
            </section>
          );
        })}
      </div>
      {total === 0 && <p className="empty">The backlog is empty. Add an item to start.</p>}
      {item && <Panel item={item} run={p.tasks.get(item.id)} events={p.events} now={now} stub={stub} act={p.act} close={() => p.select(null)} step={step} />}
    </div>
  );
}
