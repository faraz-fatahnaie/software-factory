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
export type ManagerSettings = { autonomy: Autonomy; parallel: number; recoveries: number; perTask: number; perDay: number; stall: number; unmerged: number };
export type ManagerInfo = { settings: ManagerSettings; spentToday: number; /** The one-time explanation that autopilot is on has not been answered yet. */ notice?: boolean };

export const AUTONOMY_OPTIONS: { value: Autonomy; label: string; hint: string }[] = [
  { value: "autopilot", label: "autopilot", hint: "Starts what is under Ready, in order (only what you promoted or named to her), tries a stopped task again or sends the Builder guidance, and updates a waiting branch with a small clash, all within the limits. After you approve a task, the factory itself pushes it, opens the pull request and merges it when the checks pass. It never approves or deploys, never builds risky work without your yes, and never starts what you did not ask for" },
  { value: "assist", label: "assist", hint: "Diagnoses and proposes; you press the buttons. Nothing starts and nothing is spent by itself" },
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
  /** Answers the one-time notice, optionally changing the autonomy at the same time. */
  const dismiss = async (patch: Partial<ManagerSettings> = {}) => {
    const r = await call<{ settings: ManagerSettings }>("/api/manager", { ...patch, seen: true });
    if (r.ok) { setInfo((i) => (i ? { ...i, settings: r.data.settings, notice: false } : i)); setProblem(""); } else setProblem(r.error);
  };
  return { info, set, dismiss, problem };
}

/**
 * Autopilot's state on every screen, with one press to pause it (F-091). Pausing switches to assist: nothing starts or retries by itself, the manager only
 * proposes. Resuming is the person's choice too, so it is the same one press back.
 */
export function AutopilotSwitch({ events }: { events: Ev[] }) {
  const { info, set } = useManager(events);
  if (!info) return null;
  const on = info.settings.autonomy === "autopilot";
  const text = on ? "Autopilot on · Pause" : info.settings.autonomy === "off" ? "Autopilot off · Turn on" : "Autopilot paused · Resume";
  return (
    // The label keeps the name where a narrow side bar hides the text and shows only the dot.
    <button className={`link vcs ${on ? "ok" : "warn"} autopilot-switch`} aria-label={text} aria-pressed={on} onClick={() => set({ autonomy: on ? "assist" : "autopilot" })}
      title={on ? "Autopilot is on: it starts what is under Ready and recovers stopped tasks, within the limits. Press to pause it (assist: it only proposes)." : `Autopilot is ${info.settings.autonomy === "off" ? "off" : "paused (assist)"}: nothing starts by itself. Press to turn it on again.`}>
      <span>{text}</span>
    </button>
  );
}

/** Where things stand, in one sentence, from the backlog alone (no model). */
export function digest(items: { id: string; title: string; section: string }[]): string {
  const n = (s: string) => items.filter((i) => i.section === s).length;
  const parts = [`${n("In progress")} running`, `${n("Awaiting approval")} waiting for you`, `${n("Blocked")} blocked`, `${n("Ready")} ready`, `${n("Inbox")} in the inbox`];
  const next = items.find((i) => i.section === "Ready");
  return `${parts.join(" · ")}${next ? `. Next: ${next.id} ${next.title}` : ""}`;
}

type Props = { events: Ev[]; items: { id: string; title: string; section: string }[]; role: string; talkTo: (topic: string) => void; open: (id: string) => void; manager: ReturnType<typeof useManager> };

export function ManagerStrip({ events, items, role, talkTo, open, manager: { info, set, dismiss, problem } }: Props) {
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
          <span className="note">{last ? <>{String(last.data?.text ?? "").slice(0, 200)} · {agoShort(last.ts)} ago</> : s.autonomy === "off" ? "Nothing starts by itself." : "Nothing to do yet. She starts what you ask her to build."}</span>
        </div>
        <Select small label="Autonomy" prefix="Manager" value={s.autonomy} options={AUTONOMY_OPTIONS} align="right" onChange={(v) => set({ autonomy: v as Autonomy })} />
        <button onClick={() => talkTo("manager")}>Talk to {who}</button>
      </header>
      {info.notice && s.autonomy === "autopilot" && (
        <section className="mgr-notice" role="region" aria-label="About autopilot">
          <p><b>Autopilot is on.</b> {who} now starts what is under Ready, in order (only what you promoted or named to her: an item only added to the Inbox waits for your word), tries a stopped task again or sends the Builder guidance, and updates a waiting branch with a small clash, all within the limits, by herself. The Pause in the side bar stops it at once. Her limits: {s.parallel} task{s.parallel === 1 ? "" : "s"} at a time, {s.recoveries} retries per task, ${s.perTask} per task and ${s.perDay} per day. After you approve a task the factory pushes and merges it when the checks pass. She never approves or deploys, never builds risky work without your yes, and everything she decides is listed here.</p>
          <div className="row gap"><button className="primary" onClick={() => dismiss()}>Keep autopilot</button><button onClick={() => dismiss({ autonomy: "assist" })}>Switch to assist</button><button onClick={() => dismiss({ autonomy: "off" })}>Turn it off</button></div>
        </section>
      )}
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
  { key: "unmerged", label: "No new work while this many approved tasks are not merged", hint: "1 to 10: each one is another branch on the same main" },
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
        <div className="grow"><h2>What {who} may do by herself</h2><p className="note">She never approves or deploys, at any level; she never pushes or merges either, except that on autopilot the factory delivers a task you approved (checks must pass). Every decision is in Logs.</p></div>
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
