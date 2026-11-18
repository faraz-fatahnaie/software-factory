// One person's panel: what they are doing right now (live feed), which files they touched, and their recent stages. Opens from any robot.
// Everything is read from the event log. A free person shows what they did last and a way to talk to them.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { elapsed, filesTouched, lastWork, roster, timelineOf, type Ev, type TaskRun } from "../plugin/engine/state";
import type { Act } from "./app";
import { Activity } from "./backlog";
import { agoShort } from "./commitgraph";
import { Icon } from "./icons";
import { NowLine } from "./live";
import { personaFor, Robot } from "./robots";
import { TALK_TO } from "./team";
import type { TeamData } from "./team";

const STAGE = { triage: "Triage", spec: "Spec", build: "Build", check: "Check", security: "Security", review: "Review", doubt: "Second review", document: "Summary" } as Record<string, string>;
const money = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const took = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? "<1s" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A robot that opens its person's panel. */
export function PersonLink({ role, open, children }: { role: string; open?: (role: string) => void; children: React.ReactNode }) {
  if (!open) return <>{children}</>;
  return <button className="person-link" onClick={() => open(role)} aria-label={`Open ${personaFor(role).name}'s panel`} title={`${personaFor(role).name}: what they are doing`}>{children}</button>;
}

type Tab = "Live feed" | "Files touched" | "Timeline" | "About";

export function PersonPanel(p: { role: string; tasks: Map<string, TaskRun>; events: Ev[]; team: TeamData | null; now: number; act: Act; close: () => void; openTask: (id: string) => void; talkTo: (key: string) => void }) {
  const { role, tasks, events } = p;
  const who = personaFor(role), info = p.team?.roles.find((r) => r.name === role);
  const job = useMemo(() => roster(tasks).find((w) => w.role === role), [tasks, role]);
  const run = job ? tasks.get(job.task) : undefined;
  const mine = useMemo(() => events.filter((e) => e.role === role), [events, role]);
  const now = useMemo(() => (job ? mine.filter((e) => e.task === job.task && e.stage === job.stage) : []), [mine, job?.task, job?.stage]);
  const touched = useMemo(() => filesTouched(now), [now]);
  const line = useMemo(() => timelineOf(events, role), [events, role]);
  const last = useMemo(() => lastWork(events).get(role), [events, role]);
  const tabs: Tab[] = job ? ["Live feed", "Files touched", "Timeline"] : ["Timeline", "About"];
  const [tab, setTab] = useState<Tab>(tabs[0]!);
  const [leaving, setLeaving] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setTab(tabs[0]!); }, [role, !!job]);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [role]);
  const close = () => { if (reduced()) return p.close(); setLeaving(true); setTimeout(p.close, 170); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea, [role=listbox]")) close(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const chat = TALK_TO[role];
  const model = info?.settings;
  const sum = touched.reduce((s, t) => ({ read: s.read + (t.read ? 1 : 0), edited: s.edited + (t.edited ? 1 : 0), wrote: s.wrote + (t.wrote ? 1 : 0) }), { read: 0, edited: 0, wrote: 0 });
  const earlier = line.filter((s) => !(job && s.task === job.task && s.stage === job.stage && s.state === "running"));

  return createPortal(
    <div className={`bk-layer${leaving ? " out" : ""}`}>
      <div className="bk-scrim" />
      <aside className="bk-panel pp-panel" role="dialog" aria-modal="false" aria-label={who.name}>
        <div className="bk-bar">
          <span className="note">Team <span aria-hidden="true">›</span> {who.name}</span>
          <button className="icon" aria-label="Close (Esc)" onClick={close}><Icon name="x" size={16} /></button>
        </div>
        <header className="pp-head">
          <Robot role={role} size={64} status={job ? "working" : "free"} />
          <div className="grow">
            <div className="row gap wrap"><h2 ref={head} tabIndex={-1}>{who.name}</h2><span className="note">{info?.title ?? role}</span>{model && <span className="tag mono" title="Model and effort. Change them in Agents.">{model.model} · {model.effort}</span>}</div>
            <p className="pp-status">
              {job ? <><i className="pulse" aria-hidden="true" /><span className="on">Working</span> on <button className="idc" onClick={() => p.openTask(job.task)}>{job.task}</button> <span className="note">{STAGE[job.stage] ?? job.stage} · {elapsed(job.since, p.now)}</span></>
                : <><i className="dot-free" aria-hidden="true" /><span className="free">Free</span>{last && <span className="note"> · last did the {(STAGE[last.stage] ?? last.stage).toLowerCase()} of <button className="idc" onClick={() => p.openTask(last.task)}>{last.task}</button> {agoShort(last.ts)} ago</span>}</>}
            </p>
          </div>
          {job && <button className="danger" onClick={() => p.act("/api/stop", { id: job.task })}>Stop {job.task}</button>}
          {!job && chat && <button className="primary" onClick={() => { p.talkTo(chat); close(); }}>Talk to {who.name}</button>}
        </header>
        <div className="bk-tabs" role="tablist" aria-label={who.name}>
          {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}{t === "Files touched" && touched.length > 0 && <span className="n">{touched.length}</span>}</button>)}
        </div>

        <div className="bk-body" key={tab} role="tabpanel" tabIndex={0}>
          {tab === "Live feed" && job && (
            <>
              <section className="bk-card live" aria-label="What is happening now"><NowLine run={run} stage={job.stage} since={job.since} now={p.now} /></section>
              <Activity run={run} focus="" shownEvents={now} live />
              {earlier.length > 0 && (
                <ul className="pp-earlier" aria-label="Earlier today">
                  {earlier.slice(0, 6).map((s, i) => <li key={i}><span className="idc">{s.task}</span><b>{STAGE[s.stage] ?? s.stage}</b><span className={s.state === "ok" ? "ok" : "bad"}>{s.state === "ok" ? "passed" : "failed"}</span><span className="note">{took(s.ms)} · {money(s.cost)} · {agoShort(s.ts)} ago</span></li>)}
                </ul>
              )}
            </>
          )}
          {tab === "Files touched" && (
            <>
              <p className="note">On {job?.task}, this stage. Updates as {who.name} works.</p>
              <div className="pp-sum"><div><span className="note">Read</span><b>{sum.read}</b></div><div><span className="note">Edited</span><b>{sum.edited}</b></div><div><span className="note">Wrote</span><b>{sum.wrote}</b></div></div>
              {touched.length === 0 ? <p className="empty">No files yet in this stage.</p> : (
                <table className="pp-table">
                  <thead><tr><th scope="col">File</th><th scope="col">What {who.name} did</th><th scope="col">Last</th></tr></thead>
                  <tbody>{touched.map((t) => (
                    <tr key={t.path}>
                      <td><code>{t.path}</code></td>
                      <td>{t.edited > 0 && <span className="k e">Edited ×{t.edited}</span>} {t.wrote > 0 && <span className="k w">Wrote ×{t.wrote}</span>} {t.read > 0 && <span className="k">Read ×{t.read}</span>}</td>
                      <td className="note">{agoShort(t.last)} ago</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              <div className="row between wrap"><span className="note">Only edited and written files change the task. Files that were only read show what {who.name} looked at.</span>{job && <button onClick={() => p.openTask(job.task)}>See {job.task}</button>}</div>
            </>
          )}
          {tab === "Timeline" && (
            line.length === 0 ? <p className="empty">{who.name} has not worked on anything yet.</p> : (
              <>
                <h3>Recent work</h3>
                <ol className="pp-line">
                  {line.map((s, i) => (
                    <li key={i}>
                      <span className="note">{agoShort(s.ts)} ago</span>
                      <span><span className="idc">{s.task}</span> <b>{STAGE[s.stage] ?? s.stage}</b> <span className={s.state === "ok" ? "ok" : s.state === "failed" ? "bad" : "on"}>{s.state === "ok" ? "passed" : s.state === "failed" ? "failed" : "working"}</span></span>
                      <span className="note">{took(s.ms)}{s.state !== "running" ? ` · ${money(s.cost)}` : ""}</span>
                    </li>
                  ))}
                </ol>
              </>
            )
          )}
          {tab === "About" && (
            <>
              <p>{info?.description ?? "A member of this team."}</p>
              {info && info.holds.length > 0 && <><h3>Takes care of</h3><ul className="pp-holds">{info.holds.map((h) => <li key={h.id}><b>{h.title}</b> <span className="note">{h.summary}</span></li>)}</ul></>}
              <p className="note">{info?.modes.includes("agent") ? `${who.name} reads the project and works on tasks; only the Builder changes code.` : `${who.name} answers you in Talk and writes documents under docs/. Nothing here can change code.`}</p>
              {chat ? <button className="primary" style={{ alignSelf: "flex-start" }} onClick={() => { p.talkTo(chat); close(); }}>Open Talk</button> : null}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
