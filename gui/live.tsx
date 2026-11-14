// What each agent is doing right now. The "Now" line and the few actions before it, the tab title and icon that say it from another tab,
// and an opt-in desktop notification when someone finishes or gets stuck. Everything here reads the event log; nothing asks the server.
import { useEffect, useRef, useState } from "react";
import { liveOf, STAGES, type Ev, type Live, type TaskRun } from "../plugin/engine/state";
import { agoShort } from "./commitgraph";
import { Icon } from "./icons";
import { personaFor } from "./robots";

/** A few more words than the stage's name, for the title of the tab. */
export const STAGE_ING: Record<string, string> = { triage: "triaging", spec: "writing the spec for", build: "building", check: "checking", security: "checking the security of", review: "reviewing", document: "writing the summary of" };
const QUIET_AFTER_MS = 120_000;

/** The sentence under a working person: the newest action, how long ago, and (folded) the few before it. */
export function NowLine({ run, stage, since, now }: { run: TaskRun | undefined; stage: string; since: string; now: number }) {
  const live: Live = liveOf(run, stage);
  const gate = stage === "check", quietMs = now - Date.parse(live.last ?? since), quiet = !gate && quietMs > QUIET_AFTER_MS;
  const text = gate ? { verb: "Running the project's checks", what: "" } : live.now;
  return (
    <div className={`now${quiet ? " quiet" : ""}`}>
      <p><i className="pulse" aria-hidden="true" /><span className="what">{text.verb}{text.what && <> <code>{text.what}</code></>}</span>{live.recent[0] && <time dateTime={live.recent[0].ts}>{agoShort(live.recent[0].ts)}</time>}</p>
      {quiet && <p className="warn-line" role="status">No activity for {Math.floor(quietMs / 60_000)} min. It may be waiting on a long command.</p>}
      {live.recent.length > 1 && (
        <details>
          <summary>Recent actions · {live.recent.length}</summary>
          <ol>{live.recent.map((r, i) => <li key={i} className={r.said ? "said" : ""}><span><b>{r.verb}</b> {r.what && <code>{r.what}</code>}</span><time dateTime={r.ts}>{agoShort(r.ts)}</time></li>)}</ol>
        </details>
      )}
    </div>
  );
}

/** The tab's title and icon say what is going on, so a person in another tab sees it: a dot colour for working, waiting on you, or quiet. */
export function useAmbient(working: { role: string; task: string; stage: string }[], waiting: number, heading: string) {
  useEffect(() => {
    const first = working[0], more = working.length > 1 ? ` +${working.length - 1}` : "";
    document.title = `${waiting ? `(${waiting}) ` : ""}${first ? `● ${personaFor(first.role).name} ${STAGE_ING[first.stage] ?? "working on"} ${first.task}${more} · ` : ""}${heading} · Software Factory`;
  }, [working.map((w) => `${w.role}${w.task}${w.stage}`).join(), waiting, heading]);
  useEffect(() => {
    const color = waiting ? "#f0b429" : working.length ? "#47d4f5" : "#8a94a3";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#17181a"/><circle cx="16" cy="16" r="7" fill="${color}"/></svg>`;
    let link = document.querySelector<HTMLLinkElement>("link[rel=icon]");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.append(link); }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, [waiting > 0, working.length > 0]);
}

const KEY = "sf-notify";
const stored = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

/** A switch in the rail. It asks the browser's permission only when you turn it on. Shown only where the browser can notify at all. */
export function useNotify(events: Ev[], tasks: Map<string, TaskRun>) {
  const supported = typeof Notification !== "undefined";
  const [on, setOn] = useState(() => supported && stored() && Notification.permission === "granted");
  const done = useRef(new Set<number>());
  const toggle = async () => {
    if (on) { setOn(false); try { localStorage.setItem(KEY, "0"); } catch { /* the choice just is not remembered */ } return; }
    const ok = Notification.permission === "granted" || (await Notification.requestPermission()) === "granted";
    setOn(ok);
    try { localStorage.setItem(KEY, ok ? "1" : "0"); } catch { /* the choice just is not remembered */ }
  };
  // Only what just happened, and only when this tab is out of sight: the history replayed on load is never announced.
  useEffect(() => {
    if (!on) return;
    for (const e of events.slice(-20)) {
      if ((e.type !== "run.done" && e.type !== "run.failed") || done.current.has(e.seq) || Date.now() - Date.parse(e.ts) > 30_000) continue;
      done.current.add(e.seq);
      if (!document.hidden) continue;
      const stages = tasks.get(e.task)?.stages ?? {}, last = [...STAGES].reverse().find((s) => stages[s]?.role);
      const who = personaFor(last ? stages[last]!.role! : "builder").name;
      new Notification(e.type === "run.done" ? `${who} finished ${e.task}` : `${who} got stuck on ${e.task}`, { body: e.type === "run.done" ? "Ready for your review." : String(e.data ?? "").slice(0, 140), tag: `${e.run}-${e.type}` });
    }
  }, [events.length, on]);
  return supported ? { on, toggle } : null;
}

export function NotifyToggle({ notify }: { notify: ReturnType<typeof useNotify> }) {
  if (!notify) return null;
  return (
    <button className="quiet theme" aria-pressed={notify.on} onClick={notify.toggle} title="A desktop notification when someone finishes or gets stuck, while this tab is hidden">
      <Icon name="bell" /><span>{notify.on ? "Notifications on" : "Notify me"}</span>
    </button>
  );
}
