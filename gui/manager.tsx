// The Technical Manager on the page: a strip on Overview (what she did last, what she may do, what the day has cost), and the settings
// she works within, in Team. Everything shown is read from the event log and /api/manager; nothing here decides anything.
import { useEffect, useState } from "react";
import type { Ev } from "../plugin/engine/state";
import { agoShort } from "./commitgraph";
import { call } from "./data";
import { Icon } from "./icons";
import { personaFor, Robot } from "./robots";
import { Select } from "./ui";

export type Autonomy = "autopilot" | "assist" | "off";
export type ManagerSettings = { autonomy: Autonomy; parallel: number; recoveries: number; perTask: number; perDay: number; stall: number };
export type ManagerInfo = { settings: ManagerSettings; spentToday: number };

export const AUTONOMY_OPTIONS: { value: Autonomy; label: string; hint: string }[] = [
  { value: "autopilot", label: "autopilot", hint: "Starts what you worked out in conversation, and recovers a stuck task, by itself, within the limits" },
  { value: "assist", label: "assist", hint: "Diagnoses and proposes; you press the buttons" },
  { value: "off", label: "off", hint: "Does nothing by itself. You can still talk to the manager" },
];

const isManager = (e: Ev) => e.type === "manager.decision" || e.type === "manager.note";

/** The manager's settings and today's spend. Read again whenever the manager does something or a run ends, so the numbers follow the work. */
export function useManager(events: Ev[]) {
  const [info, setInfo] = useState<ManagerInfo | null>(null);
  const [problem, setProblem] = useState("");
  const marker = events.filter((e) => isManager(e) || e.type === "run.done" || e.type === "run.failed").length;
  useEffect(() => { call<ManagerInfo>("/api/manager").then((r) => r.ok && setInfo(r.data)); }, [marker]);
  /** Saves a change; says why in plain words when the server refuses it. */
  const set = async (patch: Partial<ManagerSettings>) => {
    const r = await call<{ settings: ManagerSettings }>("/api/manager", patch);
    if (r.ok) { setInfo((i) => (i ? { ...i, settings: r.data.settings } : i)); setProblem(""); } else setProblem(r.error);
    return r.ok;
  };
  return { info, set, problem };
}

/** Where things stand, in one sentence, from the backlog alone (no model). */
export function digest(items: { id: string; title: string; section: string }[]): string {
  const n = (s: string) => items.filter((i) => i.section === s).length;
  const parts = [`${n("In progress")} running`, `${n("Awaiting approval")} waiting for you`, `${n("Blocked")} blocked`, `${n("Ready")} ready`, `${n("Inbox")} in the inbox`];
  const next = items.find((i) => i.section === "Ready");
  return `${parts.join(" · ")}${next ? `. Next: ${next.id} ${next.title}` : ""}`;
}

type Props = { events: Ev[]; items: { id: string; title: string; section: string }[]; role: string; talkTo: (topic: string) => void; open: (id: string) => void; manager: ReturnType<typeof useManager> };

export function ManagerStrip({ events, items, role, talkTo, open, manager: { info, set, problem } }: Props) {
  const [more, setMore] = useState(false);
  const mine = events.filter(isManager).slice(-8).reverse();
  const last = mine.find((e) => e.type === "manager.decision") ?? mine[0], who = personaFor(role).name; // the short decision, not her longer note
  if (!info) return null;
  const s = info.settings, rest = s.perDay - info.spentToday;
  const needsYou = mine.find((e) => e.type === "manager.decision" && e.data?.action === "escalate");
  const headline = s.autonomy === "autopilot" ? `${who} is on autopilot` : s.autonomy === "assist" ? `${who} is on assist` : `Autopilot is off`;
  return (
    <article className={`tile manager${needsYou && Date.now() - Date.parse(needsYou.ts) < 3_600_000 ? " warn" : ""}`} aria-label="Technical Manager">
      <header>
        <Robot role={role} size={44} status={s.autonomy === "autopilot" ? "working" : "free"} />
        <div className="grow">
          <h2>{headline}</h2>
          <span className="note">{last ? <>{String(last.data?.text ?? "").slice(0, 200)} · {agoShort(last.ts)} ago</> : s.autonomy === "off" ? "Nothing starts by itself." : "Nothing to do yet. She starts what you work out in conversation."}</span>
        </div>
        <Select small label="Autonomy" prefix="Manager" value={s.autonomy} options={AUTONOMY_OPTIONS} align="right" onChange={(v) => set({ autonomy: v as Autonomy })} />
        <button onClick={() => talkTo("manager")}>Talk to {who}</button>
      </header>
      <p className="digest">{digest(items)}</p>
      <div className="mgr-stats">
        <span className="stat"><b>${info.spentToday.toFixed(2)}</b> of ${s.perDay} today<meter value={Math.min(info.spentToday, s.perDay)} max={s.perDay} low={s.perDay * 0.7} high={s.perDay * 0.9} optimum={0} aria-label={`Spent today: $${info.spentToday.toFixed(2)} of $${s.perDay}`} /></span>
        <span className="stat"><b>{items.filter((i) => i.section === "In progress").length}</b> of {s.parallel} at once</span>
        <span className="stat"><b>{s.recoveries}</b> retries per task · up to <b>${s.perTask}</b> each</span>
        {rest <= 0 && s.autonomy === "autopilot" && <span className="badge bad">Day limit reached</span>}
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
      {mine.length > 0 && (
        <>
          <button className="quiet" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Hide" : "Show"} what she decided</button>
          {more && (
            <ul className="decisions" aria-label="Recent decisions">
              {mine.map((e) => (
                <li key={e.seq} className={e.data?.action === "escalate" ? "warn" : undefined}>
                  <Icon name={e.type === "manager.note" ? "talk" : e.data?.action === "escalate" ? "x" : "tick"} size={14} />
                  <span className="grow">{String(e.data?.text ?? "")}</span>
                  {e.task && /^F-\d+$/.test(e.task) && <button className="chip-id" onClick={() => open(e.task)}>{e.task}</button>}
                  <span className="note">{agoShort(e.ts)} ago</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

const FIELDS: { key: keyof Omit<ManagerSettings, "autonomy">; label: string; hint: string; step?: number }[] = [
  { key: "parallel", label: "Tasks at once", hint: "1 to 8" },
  { key: "recoveries", label: "Automatic retries per task", hint: "0 to 5" },
  { key: "perTask", label: "Spend limit per task ($)", hint: "stops retrying a task that cost this much", step: 0.5 },
  { key: "perDay", label: "Spend limit per day ($)", hint: "no new work after this", step: 1 },
  { key: "stall", label: "Stop a silent task after (minutes)", hint: "5 to 240" },
];

/** What the manager may do by itself, and its limits, for the Team view. */
export function ManagerSettingsTile({ events, role }: { events: Ev[]; role: string }) {
  const manager = useManager(events);
  const { info, set, problem } = manager;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  if (!info) return null;
  const s = info.settings, who = personaFor(role).name;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
    if (!Object.keys(patch).length) return;
    if (await set(patch)) { setDraft({}); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };
  return (
    <section className="tile mgr-settings" aria-label={`What ${who} may do by herself`}>
      <header className="row gap">
        <Robot role={role} size={40} />
        <div className="grow"><h2>What {who} may do by herself</h2><p className="note">She never approves, pushes, merges or deploys, at any level. Every decision is in Logs.</p></div>
      </header>
      <fieldset>
        <legend>Autonomy</legend>
        <div className="choices">
          {AUTONOMY_OPTIONS.map((o) => (
            <label key={o.value} className={`choice${s.autonomy === o.value ? " on" : ""}`}>
              <input type="radio" name="autonomy" checked={s.autonomy === o.value} onChange={() => set({ autonomy: o.value })} />
              <span><b>{o.label[0]!.toUpperCase()}{o.label.slice(1)}</b><span className="note">{o.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <form onSubmit={save} className="limits">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{f.label} <span className="note">{f.hint}</span></span>
            <input type="number" min={0} step={f.step ?? 1} inputMode="decimal" placeholder={String(s[f.key])} value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          </label>
        ))}
        <div className="row gap"><button className="primary" disabled={!Object.values(draft).some((v) => v !== "")}>Save limits</button>{saved && <span className="note" role="status">Saved</span>}</div>
      </form>
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
  );
}
