// Integration: which finished tasks are waiting to reach main, what each one touches, which of them will clash, and the order to merge them in.
//
// With a GitHub `origin`, approving a task keeps its branch and merges nothing, so every task is built on the main of its day and the branches pile up.
// Whoever merges one makes the others clash. Nothing owned that: this is the Release Engineer's job (G3), done with git alone, no model. Merging itself
// stays the person's; the Builder resolves a clash, in the task's own folder, as in `factory update`.
//
// Everything here only reads: a trial merge is computed by git without touching a branch or a folder (`git merge-tree`, git 2.38 or newer).
import { dependsOn, type Item } from "./backlog";
import { behindBy, branchOf, git, isLanded } from "./worktree";

export type Waiting = {
  id: string; title: string; branch: string;
  /** Finished and waiting for a decision, or approved and waiting to be merged. */
  state: "awaiting" | "approved";
  files: string[]; behind: number; dependsOn: string[];
};
export type Clash = { a: string; b: string; files: string[] };
export type Plan = {
  waiting: Waiting[];
  /** Tasks whose branch clashes with main now, with the files. */
  main: { id: string; files: string[] }[];
  /** Pairs of tasks that clash with each other (only the later one to merge has to be updated). */
  between: Clash[];
  /** The order to merge in: each step is tasks that can go together, and what has to be updated afterwards. */
  steps: { ids: string[]; then: string[] }[];
  /** False when git is too old to forecast (no `git merge-tree --write-tree`): the list and the order are still given. */
  forecast: boolean;
};

const hasRef = (root: string, ref: string) => Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", ref], { cwd: root }).exitCode === 0;

/** The files that clash when `a` is merged into `b`, none when it merges cleanly, undefined when git cannot say. Nothing is changed. */
export function trial(root: string, a: string, b: string): string[] | undefined {
  const p = Bun.spawnSync(["git", "merge-tree", "--write-tree", "--name-only", "--no-messages", a, b], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const lines = p.stdout.toString().split("\n");
  // Exit 0 is a clean merge, exit 1 a clash: both print the merged tree's id first. Anything else, or no id (an old git, a ref that is not there: git also exits 1 for that), is "cannot say".
  if (p.exitCode !== 0 && p.exitCode !== 1) return undefined;
  if (!/^[0-9a-f]{40,64}$/.test(lines[0] ?? "")) return undefined;
  return p.exitCode === 0 ? [] : lines.slice(1).map((l) => l.trim()).filter(Boolean);
}

/** The files a task's branch changes, against where it left main. */
export const filesOf = (root: string, branch: string, base = "HEAD"): string[] => {
  try { return git(root, "diff", "--name-only", `${base}...${branch}`).split("\n").filter(Boolean); } catch { return []; }
};

/** Tasks that are finished and not in main yet: waiting for a decision, or approved (with a GitHub `origin`, until someone merges the pull request). */
export function waiting(root: string, items: Item[]): Waiting[] {
  const out: Waiting[] = [];
  for (const i of items) {
    const branch = branchOf(i.id);
    if (!hasRef(root, `refs/heads/${branch}`)) continue;
    const state = i.section === "Awaiting approval" ? "awaiting" : i.section === "Done" && !isLanded(root, i.id) ? "approved" : undefined;
    if (!state) continue;
    let behind = 0;
    try { behind = behindBy(root, i.id); } catch { /* a branch that cannot be compared is listed with 0 */ }
    out.push({ id: i.id, title: i.title, branch, state, files: filesOf(root, branch), behind, dependsOn: dependsOn(i) });
  }
  return out;
}

/** The whole picture: what is waiting, who clashes with whom, and the order to merge in. */
export function plan(root: string, items: Item[]): Plan {
  const list = waiting(root, items);
  const main: Plan["main"] = [], between: Clash[] = [];
  let forecast = true;
  for (const w of list) {
    const f = trial(root, "HEAD", w.branch);
    if (f === undefined) forecast = false; else if (f.length) main.push({ id: w.id, files: f });
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const f = trial(root, list[i]!.branch, list[j]!.branch);
    if (f?.length) between.push({ a: list[i]!.id, b: list[j]!.id, files: f });
  }
  return { waiting: list, main, between, steps: order(list, between, main), forecast };
}

/**
 * Dependencies first (a task goes after the ones it names). Then tasks that clash with nothing go together, as one step; the rest go one at a time, the smallest
 * change first, because the later of two clashing tasks is the one that has to be updated, and a small one is the cheaper to rework. `then` names who has to be
 * updated after a step (the tasks that clash with what it merges).
 */
export function order(list: Waiting[], between: Clash[], main: { id: string; files: string[] }[] = []): Plan["steps"] {
  const ids = new Set(list.map((w) => w.id));
  const clashes = (id: string) => [...new Set(between.filter((c) => c.a === id || c.b === id).map((c) => (c.a === id ? c.b : c.a)))];
  const size = (id: string) => list.find((w) => w.id === id)!.files.length;
  const placed = new Set<string>(), steps: Plan["steps"] = [];
  const ready = (w: Waiting) => !placed.has(w.id) && w.dependsOn.filter((d) => ids.has(d)).every((d) => placed.has(d));
  while (placed.size < list.length) {
    const open = list.filter(ready);
    if (!open.length) { // a dependency loop: whatever is left goes in the order it came, never dropped
      const rest = list.filter((w) => !placed.has(w.id));
      for (const w of rest) { steps.push({ ids: [w.id], then: clashes(w.id).filter((o) => !placed.has(o)) }); placed.add(w.id); }
      break;
    }
    const free = open.filter((w) => !clashes(w.id).some((o) => ids.has(o) && !placed.has(o)) && !main.some((m) => m.id === w.id));
    if (free.length) { steps.push({ ids: free.map((w) => w.id), then: [] }); free.forEach((w) => placed.add(w.id)); continue; }
    const next = open.slice().sort((a, b) => size(a.id) - size(b.id) || a.id.localeCompare(b.id))[0]!;
    placed.add(next.id);
    steps.push({ ids: [next.id], then: clashes(next.id).filter((o) => !placed.has(o)) });
  }
  return steps;
}

/** The plan in words, for `factory integrate`, for Tess and for the Release Engineer. */
export function formatPlan(p: Plan): string {
  if (!p.waiting.length) return "Nothing is waiting to be merged: every finished task is in main.";
  const lines = [`Waiting to reach main (${p.waiting.length}):`];
  for (const w of p.waiting) lines.push(`  ${w.id}  ${w.state === "approved" ? "approved" : "waiting for your decision"} · ${w.files.length} file${w.files.length === 1 ? "" : "s"} · ${w.behind ? `main has ${w.behind} newer commit${w.behind === 1 ? "" : "s"}` : "up to date with main"}${w.dependsOn.length ? ` · needs ${w.dependsOn.join(", ")}` : ""}  ${w.title.slice(0, 70)}`);
  if (!p.forecast) lines.push("", "This git is too old to forecast clashes (it needs 2.38 or newer); the order below goes by what each task touches and needs.");
  if (p.main.length || p.between.length) {
    lines.push("", "Clashes:");
    for (const m of p.main) lines.push(`  ${m.id} clashes with main now (${m.files.join(", ")})`);
    for (const c of p.between) lines.push(`  ${c.a} and ${c.b} clash with each other (${c.files.join(", ")})`);
  } else if (p.forecast) lines.push("", "No clashes: each of them merges cleanly into main, and into each other.");
  lines.push("", "Merge in this order, one step at a time (sync after each):");
  p.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.ids.join(" and ")}${s.ids.length > 1 ? " (together: no clash between them)" : ""}${s.then.length ? `, then update ${s.then.join(", ")} (they clash with it: \`factory update <id>\` lets the Builder resolve it)` : ""}`));
  return lines.join("\n");
}
