// The facts behind the Technical Manager's milestone, retrospective and team-health work (M12, M16, M17).
// Counted from the backlog and the event log, with no model: a model only reads this report and says what it means.
import type { Item } from "./backlog";
import type { Store } from "./events";
import { costs, reviewApproves, type Ev } from "./state";
import { failureKind, type Kind } from "./supervisor";

export type Milestone = { name: string; ids: string[]; done: number; open: string[] };
/** The milestones the backlog's items name (a `Milestone: <name>` detail line, as the Planner writes it), in the order they first appear. */
export function milestones(items: Item[]): Milestone[] {
  const by = new Map<string, Milestone>();
  for (const it of items) {
    const name = it.detail.match(/^\s*Milestone:\s*(.+?)\s*$/im)?.[1];
    if (!name) continue;
    const m = by.get(name) ?? { name, ids: [], done: 0, open: [] };
    m.ids.push(it.id);
    if (it.section === "Done") m.done++; else m.open.push(it.id);
    by.set(name, m);
  }
  return [...by.values()];
}

/** Every event in the log (the store hands them out a page at a time). */
export function allEvents(store: Store): Ev[] {
  const out: Ev[] = [];
  for (let page = store.since(0); page.length; page = store.since(out.at(-1)!.seq)) out.push(...(page as Ev[]));
  return out;
}

const CAUSE: Record<Kind, string> = {
  builds: "three builds did not pass the checks or the review", rate_limit: "every model was rate limited", auth: "the Claude command line was not logged in",
  setup: "the project's setup or check command failed", clash: "it clashed with changes on main", unready: "triage found it not ready (too large, or no way to check it)",
  stalled: "it stopped giving any sign of life", stopped: "it was stopped on purpose", other: "another error",
  blocked: "something outside the task had to change first", consent: "it planned risky work and waited for your yes", stuck: "another attempt would have changed nothing", budget: "it reached the limit for one task",
};

export type Health = {
  runs: number; stopped: number;
  /** Why runs stopped, most frequent first. A run a person stopped on purpose is not a failure. */
  causes: { kind: Kind; text: string; count: number; tasks: string[] }[];
  /** Builds, and how many were sent back before a review approved one. */
  builds: number; checksFailed: number; reviewsBack: number; securityBack: number;
  roles: { role: string; stages: number; failed: number; cost: number }[];
};
/** What went wrong and what it cost, from the whole log. */
export function health(events: Ev[]): Health {
  const h: Health = { runs: 0, stopped: 0, causes: [], builds: 0, checksFailed: 0, reviewsBack: 0, securityBack: 0, roles: [] };
  const causes = new Map<Kind, Set<string>>(), counts = new Map<Kind, number>();
  for (const e of events) {
    if (e.type === "run.start") h.runs++;
    if (e.type === "run.failed") {
      const kind = failureKind(String(e.data ?? ""));
      if (kind === "stopped") continue;
      h.stopped++;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      causes.set(kind, (causes.get(kind) ?? new Set()).add(e.task));
    }
    if (e.stage === "build" && e.type === "stage.ok") h.builds++;
    if (e.stage === "check" && e.type === "stage.failed") h.checksFailed++;
    if (e.stage === "security" && e.type === "stage.failed") h.securityBack++;
    if (e.stage === "review" && e.type === "stage.ok" && !reviewApproves(e.data?.output ?? "")) h.reviewsBack++;
  }
  h.causes = [...counts].map(([kind, count]) => ({ kind, text: CAUSE[kind], count, tasks: [...causes.get(kind)!] })).sort((a, b) => b.count - a.count);
  h.roles = [...costs(events).role].map(([role, r]) => ({ role, stages: r.stages, failed: r.stages - r.ok, cost: r.cost })).sort((a, b) => b.cost - a.cost);
  return h;
}

const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** The report `factory manager report` prints, and what the manager is given for a retrospective. Plain text, facts only. */
export function report(items: Item[], events: Ev[]): string {
  const ms = milestones(items), h = health(events), back = h.checksFailed + h.reviewsBack + h.securityBack;
  const decided = events.filter((e) => e.type === "manager.decision").slice(-8).reverse(); // so she can say why something started or stopped, instead of guessing
  return [
    "Milestones",
    ...(ms.length ? ms.map((m) => `- ${m.name}: ${m.done} of ${n(m.ids.length, "task")} done${m.open.length ? ` (open: ${m.open.join(", ")})` : ""}`) : ["- No backlog item names a milestone (a `Milestone: <name>` line in its detail)."]),
    "",
    `What stopped tasks (${n(h.stopped, "run")} stopped out of ${h.runs})`,
    ...(h.causes.length ? h.causes.map((c) => `- ${c.text}: ${n(c.count, "time")} (${c.tasks.join(", ")})`) : ["- Nothing stopped."]),
    "",
    `Builds sent back before one was approved: ${back} of ${n(h.builds, "build")} (checks failed ${h.checksFailed}, review asked for changes ${h.reviewsBack}, security ${h.securityBack})`,
    "",
    "What the manager decided lately (newest first)",
    ...(decided.length ? decided.map((e) => `- ${e.ts.slice(0, 16).replace("T", " ")} ${String((e.data as { text?: string } | undefined)?.text ?? "").slice(0, 160)}`) : ["- Nothing yet."]),
    "",
    "Roles, most expensive first",
    ...(h.roles.length ? h.roles.map((r) => `- ${r.role}: ${n(r.stages, "stage")}, ${r.failed} failed, $${r.cost.toFixed(2)}`) : ["- No model stage has run yet."]),
  ].join("\n");
}
