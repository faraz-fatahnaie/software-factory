// The Team view: roles as columns, responsibilities as cards. Every change is previewed against the real rules and
// the real cost before anything is saved; saving writes the config and role files and commits, like `factory team`.
import { useEffect, useState } from "react";
import type { Ev } from "../plugin/engine/state";
import { call } from "./data";

type Resp = { id: string; area: string; summary: string; title: string; built: boolean; how: string; when: string; movable: boolean; custom: boolean };
type Role = { name: string; title: string; description: string; modes: string[]; settings: { model: string; effort: string } | null; holds: Resp[] };
type Stage = { stage: string; role: string; title: string; model: string; effort: string; usd: number; always: boolean };
type TeamData = {
  preset: string; title: string; summary: string; roles: Role[]; off: Resp[]; scripts: Resp[];
  estimate: { stages: Stage[]; agents: { always: number; sometimes: string[] }; usd: number; basis: "runs" | "guide" };
  presets: { name: string; title: string; summary: string; roles: number; agents: number }[];
};
type Change =
  | { op: "use"; preset: string } | { op: "agents"; n: number } | { op: "move"; ids: string[]; to: string }
  | { op: "off" | "on"; ids: string[] } | { op: "merge"; from: string; into: string } | { op: "title"; role: string; title: string };

const FOR: Record<string, string> = { lean: "A small or personal project, nothing sensitive.", balanced: "Most projects. The default.", full: "Personal data, payments, or several people depending on it." };
const money = (n: number) => `$${n.toFixed(2)}`;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function words(c: Change, data: TeamData, before: TeamData): string {
  // A role folded away is gone from the preview, so its name comes from the saved team.
  const title = (name: string) => (data.roles.find((r) => r.name === name) ?? before.roles.find((r) => r.name === name))?.title ?? name;
  switch (c.op) {
    case "use": return `Switch to the ${c.preset} team`;
    case "agents": return `Resize the team to ${c.n} agents`;
    case "move": return `Move ${c.ids.join(", ")} to ${title(c.to)}`;
    case "off": return `Switch off ${c.ids.join(", ")}`;
    case "on": return `Switch on ${c.ids.join(", ")}`;
    case "merge": return `Fold ${title(c.from)} into ${title(c.into)}`;
    case "title": return `Rename ${title(c.role)} to ${c.title}`;
  }
}

export function Team({ events, setError }: { events: Ev[]; setError: (e: string) => void }) {
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

  if (!saved) return <p className="empty">{problem || "Loading the team…"}</p>;
  const now = preview ?? saved;
  const est = now.estimate;
  const changed = draft.length > 0 && Math.abs(est.usd - saved.estimate.usd) >= 0.005;
  const names = (skip: string) => now.roles.filter((r) => r.name !== skip);

  return (
    <div className="stack team">
      {problem && <p className="error" role="alert">{problem}</p>}

      <div className="presets" role="group" aria-label="Team size">
        {saved.presets.map((p) => (
          <button key={p.name} className="preset" aria-pressed={now.preset === p.name} disabled={busy} onClick={() => stage({ op: "use", preset: p.name })}>
            <b>{p.title}</b>
            <span>{p.roles} roles, {p.agents} agents on a normal task</span>
            <span>{FOR[p.name] ?? p.summary}</span>
          </button>
        ))}
      </div>

      <section className="tile cost" aria-label="Cost of a normal task" aria-live="polite">
        <div>
          <h2>A normal task</h2>
          <p className="figure">
            {changed && <span className="was" aria-label={`was ${money(saved.estimate.usd)}`}>{money(saved.estimate.usd)}</span>}
            {money(est.usd)}<small>about, with {est.agents.always} agents</small>
          </p>
          <p className="note">
            {est.basis === "runs" ? "Averaged from the stages this project has already run." : "A rough guide: some of these models have not run here yet. It becomes exact as tasks complete."}
            {est.agents.sometimes.length > 0 && ` Sometimes more: ${est.agents.sometimes.join("; ")}.`}
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const n = Number(size); if (n) { stage({ op: "agents", n }); setSize(""); } }}>
          <label>Or pick a size{" "}
            <input type="number" min={3} max={12} placeholder={String(now.roles.length)} value={size} onChange={(e) => setSize(e.target.value)} aria-label="Number of agents, 3 to 12" style={{ width: 70 }} />
          </label>{" "}
          <button disabled={busy || !size}>Preview</button>
        </form>
        <ol>
          {est.stages.map((s) => (
            <li key={s.stage} className={s.always ? "" : "rare"}>
              <b>{s.stage}</b>
              <span>{s.title}</span>
              <span>{s.model}, {s.effort} · {money(s.usd)}{s.always ? "" : " · only sometimes"}</span>
            </li>
          ))}
        </ol>
        {draft.length > 0 && (
          <div className="draft">
            <span>
              <b>{draft.length === 1 ? "1 change" : `${draft.length} changes`} not saved yet:</b> {draft.map((c) => words(c, now, saved)).join("; ")}.
            </span>
            <button onClick={() => show(draft.slice(0, -1))} disabled={busy}>Undo last</button>
            <button onClick={() => show([])} disabled={busy}>Discard</button>
            <button className="primary" onClick={save} disabled={busy} title="Updates factory.config.json and the role files, and commits them">Save to project</button>
          </div>
        )}
      </section>

      <div className="roles">
        {now.roles.map((r) => (
          <section
            key={r.name} className={`role${over === r.name ? " over" : ""}`} aria-label={r.title}
            onDragOver={(e) => { e.preventDefault(); setOver(r.name); }} onDragLeave={() => setOver("")}
            onDrop={(e) => {
              e.preventDefault(); setOver("");
              const id = e.dataTransfer.getData("text/plain");
              if (/^[A-Z]\d{1,3}$/.test(id) && !r.holds.some((h) => h.id === id)) stage({ op: "move", ids: [id], to: r.name });
            }}
          >
            <header>
              {renaming === r.name ? (
                <form className="role-menu" onSubmit={(e) => { e.preventDefault(); const t = new FormData(e.currentTarget).get("title") as string; setRenaming(""); if (t.trim() && t !== r.title) stage({ op: "title", role: r.name, title: t.trim() }); }}>
                  <input name="title" defaultValue={r.title} aria-label={`New title for ${r.title}`} maxLength={60} autoFocus required />
                  <button>Rename</button>
                </form>
              ) : (
                <h3>
                  {r.title}
                  {r.modes.includes("agent") && <span className="tag">unattended</span>}
                  {r.modes.includes("chat") && <span className="tag">conversation</span>}
                  {r.modes.length === 0 && <span className="tag">planned</span>}
                </h3>
              )}
              <p className="about">{r.description}</p>
              {r.settings && <p className="setting">{r.settings.model} · {r.settings.effort} effort</p>}
              <div className="role-menu">
                <button className="quiet" onClick={() => setRenaming(r.name)}>Rename</button>
                {now.roles.length > 3 && (
                  <select aria-label={`Fold ${r.title} into another role`} value="" disabled={busy} onChange={(e) => e.target.value && stage({ op: "merge", from: r.name, into: e.target.value })}>
                    <option value="">Fold into…</option>
                    {names(r.name).map((o) => <option key={o.name} value={o.name}>{o.title}</option>)}
                  </select>
                )}
              </div>
            </header>
            <ul>
              {r.holds.map((h) => (
                <li key={h.id} className={`resp${h.built ? "" : " planned"}`} draggable={h.movable} onDragStart={(e) => e.dataTransfer.setData("text/plain", h.id)}>
                  <div className="top"><span className="id">{h.id}</span><span className="name">{h.title}</span></div>
                  {h.summary !== h.title && <p className="about" title={h.summary}>{h.summary}</p>}
                  <div className="foot">
                    <span className="tag">{h.built ? (h.how === "chat" ? "conversation" : "unattended") : "planned"}</span>
                    <span className="tag">{h.area}</span>
                    {h.movable && (
                      <select aria-label={`Move ${h.id} ${h.title}`} value="" disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__new") setCreating(h.id);
                          else if (v === "__off") stage({ op: "off", ids: [h.id] });
                          else if (v) stage({ op: "move", ids: [h.id], to: v });
                        }}>
                        <option value="">Move to…</option>
                        {names(r.name).map((o) => <option key={o.name} value={o.name}>{o.title}</option>)}
                        <option value="__new">A new role…</option>
                        <option value="__off">Switch off</option>
                      </select>
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
        ))}
      </div>

      <div className="side-lists">
        <section className="tile" aria-label="Switched off">
          <header><h2>Switched off</h2></header>
          {now.off.length === 0 ? <p className="empty">Nothing is switched off. Use “Switch off” on a card to drop a responsibility from this team.</p> : (
            <ul>
              {now.off.map((h) => (
                <li key={h.id}><span className="id">{h.id}</span><span className="what">{h.title}</span><button disabled={busy} onClick={() => stage({ op: "on", ids: [h.id] })}>Switch on</button></li>
              ))}
            </ul>
          )}
        </section>
        <section className="tile" aria-label="Done by scripts">
          <header><h2>Done by scripts, not agents</h2></header>
          <ul>
            {now.scripts.map((h) => <li key={h.id}><span className="id">{h.id}</span><span className="what">{h.title}</span><span className="tag">script</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
