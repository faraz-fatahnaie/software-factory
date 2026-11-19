// What the factory could not finish by itself, and who had to step in: the maturity record.
//
// Every time work ends with "a person must decide" or "the factory is missing a capability", it is listed here, with its kind, so a recurring one can be
// fixed once (a recovery step, a permission, a rule) instead of being handled by hand each time. Read from the event log: nothing extra is stored, and
// an old project has its history. `needs` says who it came to:
//   person   a decision or an action only the person may take (an approval, a clash that is too large, failing checks, a blocked spec);
//   outside  the factory itself fell short and an outside agent or developer is needed: a command a role tried and was refused (a permission gap), or an
//            unexpected error in the factory's own code. These are the ones to repair so the factory matures.
import type { Ev } from "./state";

export type Needs = "person" | "outside";
export type Problem = { seq: number; ts: string; task: string; kind: string; needs: Needs; text: string; resolved: boolean; resolvedBy?: "autopilot" | "person" };

/** The manager decisions that hand something to the person, and what to call them. */
const BY_ACTION: Record<string, [string, Needs]> = {
  escalate: ["stuck-task", "person"], pause: ["autopilot-paused", "person"], hold: ["held-back", "person"], "update-failed": ["update-failed", "person"], "deliver-blocked": ["delivery-blocked", "person"],
};

/** Commands only a person may run, a refused attempt at which is the system working, not a gap. */
const ON_PURPOSE = /\b(git\s+(push|commit|reset|checkout|merge|rebase|branch|tag)|gh\s|factory\s+(approve|push|merge|discard|revert|deploy|release))/i;

export function problemsOf(events: Ev[]): Problem[] {
  const out: Problem[] = [];
  for (const e of events) {
    const text = String(e.data?.text ?? "");
    if (e.type === "manager.decision" && BY_ACTION[String(e.data?.action)]) {
      const [kind, needs] = BY_ACTION[String(e.data.action)]!;
      // An error in the factory's own code (not a known refusal) is the factory's to fix.
      const bug = kind === "delivery-blocked" && /^Delivery to GitHub stopped:/.test(text) && !/not signed|auth|conflict|refus|rule/i.test(text);
      out.push({ seq: e.seq, ts: e.ts, task: e.task, kind: bug ? "engine-error" : kind, needs: bug ? "outside" : needs, text: text.slice(0, 240), resolved: false });
    }
    if (e.type === "run.failed" && /\bblocked:/i.test(String(e.data ?? ""))) out.push({ seq: e.seq, ts: e.ts, task: e.task, kind: "blocked-spec", needs: "person", text: String(e.data).slice(0, 240), resolved: false });
    // A command a stage or a conversation tried and was refused, that is not one a person only may run: a role missing a capability it needed.
    const denials: string[] = e.data?.usage?.denials ?? e.data?.denials ?? [];
    for (const d of denials) if (!ON_PURPOSE.test(d)) out.push({ seq: e.seq, ts: e.ts, task: e.task, kind: "permission-gap", needs: "outside", text: `${e.role ?? e.data?.topic ?? "a role"} was refused: ${d}`.slice(0, 240), resolved: false });
  }
  // A problem on a task is over once something later happened to that task that closes it: it landed or was discarded (the person's act), or autopilot
  // delivered, retried or updated it. Problems with no task (autopilot pausing, a permission gap) stay open until the next healthy decision.
  for (const p of out) {
    const later = events.find((e) => e.seq > p.seq && (!p.task || e.task === p.task) && (e.type === "task.landed" || e.type === "task.discarded" || (e.type === "manager.decision" && ["deliver", "retry", "guide", "start", "update"].includes(String(e.data?.action)))));
    if (later) { p.resolved = true; p.resolvedBy = later.type === "manager.decision" ? "autopilot" : "person"; }
  }
  return out;
}

/** Counts by kind, who it came to, and the refused commands that came up most. */
export function problemSummary(list: Problem[]) {
  const byKind = new Map<string, { kind: string; needs: Needs; total: number; open: number }>();
  for (const p of list) { const r = byKind.get(p.kind) ?? { kind: p.kind, needs: p.needs, total: 0, open: 0 }; r.total++; if (!p.resolved) r.open++; byKind.set(p.kind, r); }
  const refused = new Map<string, number>();
  for (const p of list) if (p.kind === "permission-gap") { const c = p.text.replace(/^.*was refused: /, ""); refused.set(c, (refused.get(c) ?? 0) + 1); }
  return { kinds: [...byKind.values()].sort((a, b) => b.total - a.total), refused: [...refused].sort((a, b) => b[1] - a[1]).slice(0, 8) };
}

export function formatProblems(list: Problem[], days: number): string {
  if (!list.length) return `No problem needed a person or an outside agent in the last ${days} days.`;
  const { kinds, refused } = problemSummary(list), open = list.filter((p) => !p.resolved);
  const lines = [`Problems in the last ${days} days: ${list.length} (${open.length} still open). "outside" means the factory itself fell short.`, "", ...kinds.map((k) => `  ${k.needs.padEnd(7)} ${k.kind.padEnd(18)} ${String(k.total).padStart(3)} total, ${k.open} open`)];
  if (refused.length) lines.push("", "Commands a role tried and was refused (candidates for a recovery step or a permission):", ...refused.map(([c, n]) => `  ${n}×  ${c}`));
  if (open.length) lines.push("", "Open now:", ...open.slice(-8).map((p) => `  ${p.task || "-"}  ${p.kind}: ${p.text.slice(0, 140)}`));
  return lines.join("\n");
}
