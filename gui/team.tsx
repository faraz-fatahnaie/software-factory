// The Team view: every role is a robot with a name and a job, and its responsibilities are cards under it. Every change is
// previewed against the real rules and cost before anything is saved; saving writes the config and role files and commits.
import { useEffect, useMemo, useState } from "react";
import { lastWork, liveOf, roster, type Ev, type TaskRun } from "../plugin/engine/state";
import { agoShort } from "./commitgraph";
import { call } from "./data";
import { personaFor, PRESENCE_TEXT, Robot, type Presence } from "./robots";
import { Select, ViewSkeleton, type Option } from "./ui";

type Resp = { id: string; area: string; summary: string; title: string; built: boolean; how: string; when: string; movable: boolean; custom: boolean };
export type Role = { name: string; title: string; description: string; modes: string[]; settings: { model: string; effort: string } | null; holds: Resp[] };
type Stage = { stage: string; role: string; title: string; model: string; effort: string; usd: number; always: boolean };
export type TeamData = {
  preset: string; title: string; summary: string; roles: Role[]; off: Resp[]; scripts: Resp[];
  estimate: { stages: Stage[]; agents: { always: number; sometimes: string[] }; usd: number; basis: "runs" | "guide" };
  presets: { name: string; title: string; summary: string; roles: number; agents: number }[];
};
type Change =
  | { op: "use"; preset: string } | { op: "agents"; n: number } | { op: "move"; ids: string[]; to: string }
  | { op: "off" | "on"; ids: string[] } | { op: "merge"; from: string; into: string } | { op: "title"; role: string; title: string };

const FOR: Record<string, string> = { lean: "A small or personal project, nothing sensitive.", balanced: "Most projects. The default.", full: "Personal data, payments, or several people depending on it." };
const DOES: Record<string, string> = { spec: "Writes the spec", build: "Builds it", review: "Reviews it", triage: "Triages ad-hoc items", security: "Checks security", document: "Writes the summary" };
// Which conversation to open when you choose "Talk to…" on a role.
export const TALK_TO: Record<string, string> = { "product-partner": "brainstorm", planner: "plan", architect: "design", tester: "test", "security-performance": "secure", scribe: "docs", "release-engineer": "git" };
const money = (n: number) => `$${n.toFixed(2)}`;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Who is working on what right now, by role. */
export function presenceOf(tasks: Map<string, TaskRun>) {
  const busy = new Map<string, { task: string; stage: string }>();
  for (const w of roster(tasks)) busy.set(w.role, { task: w.task, stage: w.stage });
  return busy;
}

function words(c: Change, data: TeamData, before: TeamData): string {
  const name = (role: string) => personaFor(role).name;
  switch (c.op) {
    case "use": return `switch to the ${c.preset} team`;
    case "agents": return `resize the team to ${c.n} people`;
    case "move": return `hand ${c.ids.join(", ")} to ${name(c.to)}`;
    case "off": return `switch off ${c.ids.join(", ")}`;
    case "on": return `switch on ${c.ids.join(", ")}`;
    case "merge": return `fold ${name(c.from)} into ${name(c.into)}`;
    // A role folded away is gone from the preview, so its title comes from the saved team.
    case "title": return `rename ${(data.roles.find((r) => r.name === c.role) ?? before.roles.find((r) => r.name === c.role))?.title ?? c.role} to ${c.title}`;
  }
}

export function Team({ events, tasks, setError, talkTo }: { events: Ev[]; tasks: Map<string, TaskRun>; setError: (e: string) => void; talkTo: (topic: string) => void }) {
  const [saved, setSaved] = useState<TeamData | null>(null);
  const [draft, setDraft] = useState<Change[]>([]);
  const [preview, setPreview] = useState<TeamData | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState("");
  const [renaming, setRenaming] = useState("");
  const [creating, setCreating] = useState("");
  const [size, setSize] = useState("");
  const ran = events.filter((e) => e.type === "stage.ok").length;
  const busyRoles = useMemo(() => presenceOf(tasks), [tasks]);
  const lastDid = useMemo(() => lastWork(events), [events]);

  const load = () => call<TeamData>("/api/team").then((r) => (r.ok ? (setSaved(r.data), setProblem("")) : setProblem(r.error)));
  // Re-read after runs finish, so the cost figures follow what the stages really cost. A draft in progress is left alone.
  useEffect(() => { if (!draft.length) load(); }, [ran]);

  const show = async (changes: Change[]) => {
    if (!changes.length) { setDraft([]); setPreview(null); return; }
    setBusy(true);
    const r = await call<TeamData>("/api/team/preview", { changes });
    setBusy(false);
    if (r.ok) { setDraft(changes); setPreview(r.data); setProblem(""); }
    else setProblem(r.error); // refused: the draft stays as it was, and the reason is shown
  };
  const stage = (c: Change) => show([...draft, c]);
  const save = async () => {
    setBusy(true);
    const r = await call<TeamData>("/api/team", { changes: draft });
    setBusy(false);
    if (r.ok) { setSaved(r.data); setDraft([]); setPreview(null); setProblem(""); setError(""); }
    else setProblem(r.error);
  };

  if (!saved) return problem ? <p className="error" role="alert">{problem}</p> : <ViewSkeleton kind="team" />;
  const now = preview ?? saved;
  const est = now.estimate;
  const presence = (role: string): Presence => (busyRoles.has(role) ? "working" : "free");
  const who = (role: string) => personaFor(role).name;
  const others = (skip: string) => now.roles.filter((r) => r.name !== skip);
  const people = (skip: string): Option[] => others(skip).map((o) => ({ value: o.name, label: who(o.name), hint: o.title, leading: <Robot role={o.name} size={26} /> }));
  const always = est.stages.filter((s) => s.always), sometimes = est.stages.filter((s) => !s.always);

  return (
    <div className="stack team">
      {problem && <p className="error" role="alert">{problem}</p>}

      <div className="presets" role="group" aria-label="Team size">
        {saved.presets.map((p) => (
          <button key={p.name} className="preset" aria-pressed={now.preset === p.name} disabled={busy} onClick={() => stage({ op: "use", preset: p.name })}>
            <b>{p.title}</b>
            <span>{p.roles} people, {p.agents} on a normal task</span>
            <span>{FOR[p.name] ?? p.summary}</span>
          </button>
        ))}
      </div>

      <section className="tile crew" aria-label="A normal task">
        <div className="crew-title">
          <h2>A normal task</h2>
          <p className="note">Handled by {est.agents.always} {est.agents.always === 1 ? "person" : "people"}, in this order.</p>
        </div>
        <ol aria-label="Who handles a task, in order" title={`About ${money(est.usd)} per task (${est.basis === "runs" ? "from this project's runs" : "a rough guide"})`}>
          {always.map((s, i) => (
            <li key={s.stage}>
              <span className="inner-card">
                <Robot role={s.role} size={46} status={presence(s.role)} />
                <span><b>{who(s.role)}</b><span className="note">{DOES[s.stage]}</span></span>
              </span>
              {i < always.length - 1 && <svg viewBox="0 0 28 14" width="28" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7h22M19 2l5 5-5 5" /></svg>}
            </li>
          ))}
        </ol>
        {sometimes.length > 0 && (
          <div className="joins">
            <span className="note">Joins when needed</span>
            <span className="stack-faces">{sometimes.map((s) => <span key={s.stage} title={`${who(s.role)}: ${DOES[s.stage]}`}><Robot role={s.role} size={34} /></span>)}</span>
          </div>
        )}
        <form className="size-form" onSubmit={(e) => { e.preventDefault(); const n = Number(size); if (n) { stage({ op: "agents", n }); setSize(""); } }}>
          <label>Or pick a size{" "}
            <input type="number" min={3} max={12} placeholder={String(now.roles.length)} value={size} onChange={(e) => setSize(e.target.value)} aria-label="Number of people, 3 to 12" />
          </label>{" "}
          <button disabled={busy || !size}>Preview</button>
        </form>
      </section>

      {draft.length > 0 && (
        <div className="tile draft" role="status">
          <span>
            <b>{draft.length === 1 ? "1 change" : `${draft.length} changes`} not saved yet:</b> {draft.map((c) => words(c, now, saved)).join("; ")}.
            {" "}A normal task takes {est.agents.always} people, about {money(est.usd)}{Math.abs(est.usd - saved.estimate.usd) >= 0.005 ? ` (was ${money(saved.estimate.usd)})` : ""}
            {est.basis === "guide" ? ", a rough guide until your own tasks have run" : ""}.
          </span>
          <button onClick={() => show(draft.slice(0, -1))} disabled={busy}>Undo last</button>
          <button onClick={() => show([])} disabled={busy}>Discard</button>
          <button className="primary" onClick={save} disabled={busy} title="Updates factory.config.json and the role files, and commits them">Save to project</button>
        </div>
      )}

      <div className="roles">
        {now.roles.map((r) => {
          const state = presence(r.name), job = busyRoles.get(r.name), topic = TALK_TO[r.name];
          return (
            <section
              key={r.name} className={`role${over === r.name ? " over" : ""}`} aria-label={`${who(r.name)}, ${r.title}`}
              onDragOver={(e) => { e.preventDefault(); setOver(r.name); }} onDragLeave={() => setOver("")}
              onDrop={(e) => {
                e.preventDefault(); setOver("");
                const id = e.dataTransfer.getData("text/plain");
                if (/^[A-Z]\d{1,3}$/.test(id) && !r.holds.some((h) => h.id === id)) stage({ op: "move", ids: [id], to: r.name });
              }}
            >
              <header>
                <Robot role={r.name} size={64} status={state} />
                <div className="who">
                  <h3>{who(r.name)}</h3>
                  {renaming === r.name ? (
                    <form className="role-menu" onSubmit={(e) => { e.preventDefault(); const t = new FormData(e.currentTarget).get("title") as string; setRenaming(""); if (t.trim() && t !== r.title) stage({ op: "title", role: r.name, title: t.trim() }); }}>
                      <input name="title" defaultValue={r.title} aria-label={`New title for ${r.title}`} maxLength={60} autoFocus required />
                      <button>Rename</button>
                    </form>
                  ) : <p className="note">{r.title}</p>}
                </div>
              </header>
              <p className="status-line"><span className={`status-chip ${state}`}>{PRESENCE_TEXT[state]}</span> <span className="note">{job ? (() => { const n = job.stage === "check" ? { verb: "Running the project's checks", what: "" } : liveOf(tasks.get(job.task), job.stage).now; return `${job.task} · ${n.verb}${n.what ? ` ${n.what}` : ""}`; })() : lastDid.get(r.name) ? `Last: ${lastDid.get(r.name)!.stage} of ${lastDid.get(r.name)!.task} · ${agoShort(lastDid.get(r.name)!.ts)} ago` : r.modes.includes("chat") && !r.modes.includes("agent") ? "Ready to talk" : "Nothing to do right now"}</span>{r.settings && <span className="chip-model">{r.settings.model} · {r.settings.effort}</span>}</p>
              <p className="about">{r.description}</p>
              <div className="role-menu">
                {topic && <button onClick={() => talkTo(topic)}>Talk to {who(r.name)}</button>}
                <button className="quiet small" onClick={() => setRenaming(r.name)}>Rename</button>
                {now.roles.length > 3 && <Select small label={`Fold ${who(r.name)} into another person`} value="" placeholder="Fold into…" disabled={busy} options={people(r.name)} onChange={(v) => stage({ op: "merge", from: r.name, into: v })} />}
              </div>
              <ul>
                {r.holds.map((h) => (
                  <li key={h.id} className={`resp${h.built ? "" : " planned"}`} draggable={h.movable} onDragStart={(e) => e.dataTransfer.setData("text/plain", h.id)}>
                    <div className="top"><span className="id">{h.id}</span><span className="name">{h.title}</span></div>
                    {h.summary !== h.title && <p className="about" title={h.summary}>{h.summary}</p>}
                    <div className="foot">
                      <span className="tag">{h.built ? (h.how === "chat" ? "conversation" : "unattended") : "planned"}</span>
                      <span className="tag">{h.area}</span>
                      {h.movable && (
                        <Select
                          small label={`Hand ${h.id} ${h.title} to`} value="" placeholder="Hand to…" disabled={busy}
                          options={[...people(r.name), { value: "__new", label: "A new role…", divider: true }, { value: "__off", label: "Switch this job off" }]}
                          onChange={(v) => (v === "__new" ? setCreating(h.id) : v === "__off" ? stage({ op: "off", ids: [h.id] }) : stage({ op: "move", ids: [h.id], to: v }))}
                        />
                      )}
                    </div>
                    {creating === h.id && (
                      <form onSubmit={(e) => { e.preventDefault(); const name = slug(new FormData(e.currentTarget).get("role") as string); setCreating(""); if (name) stage({ op: "move", ids: [h.id], to: name }); }}>
                        <input name="role" aria-label="Name of the new role" placeholder="Name, for example data-steward" maxLength={30} autoFocus required />
                        <button>Move</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="side-lists">
        <section className="tile" aria-label="Switched off">
          <header><h2>Switched off</h2></header>
          {now.off.length === 0 ? <p className="empty">Nothing is switched off. Use “Switch this job off” on a card to drop a responsibility from this team.</p> : (
            <ul>
              {now.off.map((h) => (
                <li key={h.id}><span className="id">{h.id}</span><span className="what">{h.title}</span><button disabled={busy} onClick={() => stage({ op: "on", ids: [h.id] })}>Switch on</button></li>
              ))}
            </ul>
          )}
        </section>
        <section className="tile" aria-label="Done by scripts">
          <header><h2>Done by scripts, not people</h2></header>
          <ul>
            {now.scripts.map((h) => <li key={h.id}><span className="id">{h.id}</span><span className="what">{h.title}</span><span className="tag">script</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
