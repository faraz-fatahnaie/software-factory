// Version control: what is on GitHub and what is waiting, and the pushes and merges a person approves.
// An approved task is a local branch (`factory/F-id`) with no worktree. Pushing it opens a pull request; merging that is the person's call
// (or automatic when they turned `vcs.autoMerge` on). Nothing here runs unless a person or the dashboard asked for that exact action.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatFindings, parseDiff, scanSecrets } from "./security";
import { branchOf, git, worktreeOf } from "./worktree";

const GH = () => process.env.FACTORY_GH ?? "gh"; // overridable so tests never touch GitHub
const run = (argv: string[], cwd: string) => {
  const p = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe", env: process.env });
  return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
};
const gh = (cwd: string, ...args: string[]) => run([GH(), ...args], cwd);
const tryGit = (cwd: string, ...args: string[]) => { try { return git(cwd, ...args); } catch { return null; } };

export type Checks = "passing" | "failing" | "pending" | "none";
export type Check = { name: string; state: "passing" | "failing" | "pending"; url?: string };
export type Pr = { number: number; url: string; state: "OPEN" | "MERGED" | "CLOSED"; checks: Checks; mergeable: boolean; checkList: Check[]; /** For a combined pull request: the tasks it holds. */ tasks?: string[] };
/** One pull request that holds several approved tasks (branch `factory/batch-<time>`). */
export type Batch = { id: string; tasks: string[]; pr: Pr };
export const BATCH = /^batch-\d{8,}(?:-\d+)?$/;
export type Branch = { id: string; pushed: boolean; revert?: boolean; pr?: Pr };
export type Status = { remote: string | null; github: boolean; ghReady: boolean; base: string; branches: Branch[]; batches: Batch[]; note?: string };

export const remoteUrl = (root: string) => tryGit(root, "remote", "get-url", "origin");
export const baseBranch = (root: string) => git(root, "rev-parse", "--abbrev-ref", "HEAD");
const hasRef = (root: string, ref: string) => tryGit(root, "rev-parse", "--verify", "-q", ref) !== null;

const FAILED = ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"];
/** One check from `gh`'s rollup (a check run, or an older status context), as passing, failing or still running. */
const checkOf = (c: any): Check => ({
  name: String(c.name ?? c.context ?? "check"), url: c.detailsUrl || c.targetUrl || undefined,
  state: FAILED.includes(c.conclusion ?? c.state) ? "failing" : (c.status !== undefined && c.status !== "COMPLETED") || ["PENDING", "EXPECTED"].includes(c.state) ? "pending" : "passing",
});

/** One word for the checks on a pull request, from what `gh` reports. */
export function summarizeChecks(rollup: any[] | null | undefined): Checks {
  if (!rollup?.length) return "none";
  const states = rollup.map((c) => checkOf(c).state);
  return states.includes("failing") ? "failing" : states.includes("pending") ? "pending" : "passing";
}

/** The pull requests the factory opened, by task id. null when `gh` cannot answer (not installed, not signed in, offline). */
export function listPrs(root: string): Map<string, Pr> | null {
  const r = gh(root, "pr", "list", "--state", "all", "--limit", "100", "--json", "number,url,state,headRefName,mergeable,statusCheckRollup,body");
  if (r.code !== 0) return null;
  const out = new Map<string, Pr>();
  for (const p of JSON.parse(r.out || "[]")) {
    const id = new RegExp(`^factory/(F-\\d+|batch-[\\w-]+)$`).exec(p.headRefName)?.[1];
    if (!id || (out.get(id)?.state === "OPEN" && p.state !== "OPEN")) continue; // an open pull request wins over an old closed one
    out.set(id, { number: p.number, url: p.url, state: p.state, checks: summarizeChecks(p.statusCheckRollup), mergeable: p.mergeable !== "CONFLICTING", checkList: (p.statusCheckRollup ?? []).map(checkOf), ...(BATCH.test(id) && { tasks: (/^Tasks: (.+)$/m.exec(p.body ?? "")?.[1] ?? "").split(/\s+/).filter((t: string) => /^F-\d+$/.test(t)) }) });
  }
  return out;
}

const isRevert = (root: string, branch: string) => (tryGit(root, "log", "-1", "--format=%s", branch) ?? "").startsWith("Revert ");

/** What is waiting: approved tasks that are only on this machine, pushed ones, and their pull requests. Reads git; asks GitHub only if `prs`. */
export function vcsStatus(root: string, prs = true): Status {
  const remote = remoteUrl(root);
  const ghReady = gh(root, "auth", "status").code === 0;
  const status: Status = { remote, github: !!remote && /github\.com/.test(remote), ghReady, base: baseBranch(root), branches: [], batches: [] };
  const found = remote && ghReady && prs ? listPrs(root) : null;
  if (remote && ghReady && prs && !found) status.note = "GitHub did not answer, so pull request details are missing.";
  // A task inside a combined pull request (open, or merged and not yet tidied) is shown with that pull request, not on its own.
  const batched = new Set<string>();
  for (const [id, pr] of found ?? []) {
    if (!BATCH.test(id)) continue;
    const here = (pr.tasks ?? []).filter((t) => hasRef(root, `refs/heads/${branchOf(t)}`));
    if (pr.state === "OPEN" || (pr.state === "MERGED" && here.length)) { status.batches.push({ id, tasks: here.length ? here : pr.tasks ?? [], pr }); for (const t of here) batched.add(t); }
  }
  for (const ref of git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads/factory/").split("\n").filter(Boolean)) {
    const id = ref.slice("factory/".length);
    if (!/^F-\d+$/.test(id) || existsSync(worktreeOf(root, id)) || batched.has(id)) continue; // still being worked on, or inside a combined pull request
    status.branches.push({ id, pushed: hasRef(root, `refs/remotes/origin/${ref}`), revert: isRevert(root, ref) || undefined, pr: found?.get(id) });
  }
  return status;
}

/** One-line description per waiting branch, for `factory vcs` and for the conversation that explains it. */
export function formatStatus(s: Status, autoMerge: boolean, autoPush = false): string {
  const lines = [s.remote ? `remote: ${s.remote}${s.github ? "" : " (not GitHub)"}` : "remote: none. This project's work exists only on this machine.",
    `GitHub CLI: ${s.ghReady ? "signed in" : "not signed in (run: gh auth login)"}`, `auto-merge: ${autoMerge ? "on (merges when checks pass)" : "off (you merge)"}`, `push on approval: ${autoPush ? "on (approving a task pushes it and opens its pull request)" : "off (you push)"}`];
  if (s.note) lines.push(s.note);
  if (!s.branches.length && !s.batches.length) lines.push("nothing is waiting to be pushed or merged");
  for (const b of s.batches) lines.push(`${b.id}: one pull request #${b.pr.number} ${b.pr.state.toLowerCase()}${b.pr.state === "OPEN" ? `, checks ${b.pr.checks}${b.pr.mergeable ? "" : ", conflicts"}` : ""}, holding ${b.tasks.join(", ")}`);
  for (const b of s.branches) {
    const where = b.revert && !b.pr ? "a revert, only on this machine" : b.pr ? `pull request #${b.pr.number} ${b.pr.state.toLowerCase()}${b.pr.state === "OPEN" ? `, checks ${b.pr.checks}${b.pr.mergeable ? "" : ", has conflicts"}` : ""} ${b.pr.url}` : b.pushed ? "pushed, no pull request found" : "approved, only on this machine";
    lines.push(`${b.id}: ${where}`);
  }
  return lines.join("\n");
}

/** The text of a pull request: where it came from, the spec and the review, trimmed. All of it came from earlier stages of this run. */
export function prBody(id: string, spec: string, review: string): string {
  const part = (title: string, text: string) => (text.trim() ? `\n\n## ${title}\n${text.trim().slice(0, 1500)}${text.trim().length > 1500 ? "\n…" : ""}` : "");
  return `Built by the software factory from backlog item ${id}.${part("What and why", spec)}${part("Review", review)}`;
}

function need(root: string): string {
  const remote = remoteUrl(root);
  if (!remote) throw new Error("this project has no GitHub remote. Set one up with /software-factory:git");
  if (gh(root, "auth", "status").code !== 0) throw new Error("the GitHub CLI is not signed in. Run `gh auth login` yourself, then try again");
  return remote;
}

/** Pushes an approved task's branch and opens its pull request. Refuses on a possible secret. Returns the pull request URL. */
export function pushTask(root: string, id: string, title: string, spec = "", review = ""): string {
  need(root);
  const branch = branchOf(id), base = baseBranch(root);
  if (!hasRef(root, `refs/heads/${branch}`)) throw new Error(`there is no branch for ${id}. Approve it first`);
  if (existsSync(worktreeOf(root, id))) throw new Error(`${id} is still being worked on. Approve it first`);
  const found = scanSecrets(parseDiff(git(root, "diff", `${base}...${branch}`, "-U0", "--no-color")));
  if (found.length) throw new Error(`${id} was not pushed: possible secrets in what would be uploaded.\n${formatFindings(found)}\nRemove them (or mark a known false alarm with "factory:allow-secret" on the line), then push again.`);
  const open = listPrs(root)?.get(id);
  if (open?.state === "OPEN") {
    // The pull request is already there: what was added to the branch since (an update from main) goes to it. Nothing else changes.
    try { git(root, "push", "-q", "origin", branch); } catch (e) { throw new Error(`${id}'s pull request is open, but its new commits were not pushed: ${(e as Error).message}`); }
    return open.url;
  }
  const revert = isRevert(root, branch);
  try { git(root, "push", "-q", "-u", "origin", branch); } catch (e) {
    throw new Error(`${(e as Error).message}\nIf an older branch named ${branch} is still on GitHub from an earlier pull request, delete it there, then push again.`);
  }
  const r = gh(root, "pr", "create", "--head", branch, "--base", base, "--title", revert ? `Revert ${id}: ${title}` : `${id}: ${title}`,
    "--body", revert ? `Undoes ${id}: ${title}. Prepared by the software factory at your request.` : prBody(id, spec, review));
  if (r.code !== 0) throw new Error(`${id} was pushed, but opening the pull request failed: ${r.err}`);
  return r.out.split("\n").at(-1)!; // the pull request URL
}

/** The text of a combined pull request: the tasks it holds, each with its spec and review, trimmed. A last `Tasks:` line lets the factory find them again. */
export function batchBody(tasks: { id: string; title: string; spec: string; review: string }[]): string {
  const part = (text: string, n: number) => (text.trim() ? `\n${text.trim().slice(0, n)}${text.trim().length > n ? "\n…" : ""}\n` : "");
  return `Built by the software factory from backlog items ${tasks.map((t) => t.id).join(", ")}, as one pull request at the maintainer's request.\n\n${tasks.map((t) => `## ${t.id}: ${t.title}\n${part(t.spec, 700)}${part(t.review, 500)}`).join("\n")}\nTasks: ${tasks.map((t) => t.id).join(" ")}`;
}

/**
 * Pushes several approved tasks as ONE pull request. The tasks are merged, one after the other, into a new branch (`factory/batch-<time>`, in a
 * throwaway worktree so your checkout does not move). A task that changes the same lines as an earlier one is held back and listed: push it on its own.
 * Refuses on a possible secret in the whole batch. Nothing is pushed unless at least two tasks merge cleanly.
 */
export function pushBatch(root: string, tasks: { id: string; title: string; spec: string; review: string }[]): { url: string; branch: string; included: string[]; held: { id: string; why: string }[] } {
  need(root);
  if (tasks.length < 2 || tasks.length > 8) throw new Error("a combined pull request holds 2 to 8 tasks");
  const base = baseBranch(root);
  for (const t of tasks) {
    if (!hasRef(root, `refs/heads/${branchOf(t.id)}`)) throw new Error(`there is no branch for ${t.id}. Approve it first`);
    if (existsSync(worktreeOf(root, t.id))) throw new Error(`${t.id} is still being worked on. Approve it first`);
  }
  const open = listPrs(root);
  for (const [id, pr] of open ?? []) for (const t of pr.tasks ?? []) if (pr.state === "OPEN" && tasks.some((x) => x.id === t)) throw new Error(`${t} is already in ${id}'s open pull request #${pr.number}`);
  let name = `batch-${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}`, n = 1;
  while (hasRef(root, `refs/heads/factory/${name}`) || hasRef(root, `refs/remotes/origin/factory/${name}`)) name = `batch-${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}-${++n}`;
  const branch = `factory/${name}`, dir = join(root, ".worktrees", name);
  git(root, "worktree", "add", "-q", "-b", branch, dir, base);
  const included: typeof tasks = [], held: { id: string; why: string }[] = [];
  let pushed = false;
  try {
    for (const t of tasks) {
      try { git(dir, "merge", "--no-ff", "-q", "-m", `Merge ${t.id}: ${t.title}`, branchOf(t.id)); included.push(t); }
      catch { Bun.spawnSync(["git", "merge", "--abort"], { cwd: dir }); held.push({ id: t.id, why: "it changes the same lines as an earlier task in this batch" }); }
    }
    if (included.length < 2) throw new Error(`Fewer than two of these tasks merge cleanly together (${held.map((h) => `${h.id}: ${h.why}`).join("; ")}). Push them one at a time.`);
    const found = scanSecrets(parseDiff(git(dir, "diff", `${base}...HEAD`, "-U0", "--no-color")));
    if (found.length) throw new Error(`the batch was not pushed: possible secrets in what would be uploaded.\n${formatFindings(found)}\nRemove them (or mark a known false alarm with "factory:allow-secret" on that line), then try again.`);
    git(dir, "push", "-q", "-u", "origin", branch);
    pushed = true;
    const r = gh(root, "pr", "create", "--head", branch, "--base", base, "--title", `${included.map((t) => t.id).join(", ")}: ${included.length} tasks`, "--body", batchBody(included));
    if (r.code !== 0) throw new Error(`${branch} was pushed, but opening the pull request failed: ${r.err}`);
    return { url: r.out.split("\n").at(-1)!, branch, included: included.map((t) => t.id), held };
  } catch (e) {
    tryGit(root, "worktree", "remove", "--force", dir);
    if (!pushed) tryGit(root, "branch", "-D", branch); // nothing went up: leave no half-made branch behind
    throw e;
  } finally {
    tryGit(root, "worktree", "remove", "--force", dir);
  }
}

/** After a merge on GitHub: bring the merged code into this project's main branch and drop the branches that are done. */
function tidy(root: string, prs: Map<string, Pr>): string[] {
  const lines: string[] = [], base = baseBranch(root);
  git(root, "fetch", "-q", "origin");
  const behind = Number(tryGit(root, "rev-list", "--count", `HEAD..origin/${base}`) ?? 0);
  if (behind) {
    if (tryGit(root, "status", "--porcelain", "--untracked-files=no")) lines.push(`${base} is ${behind} commit${behind > 1 ? "s" : ""} behind GitHub, but this project has uncommitted changes, so it was not updated`);
    else if (tryGit(root, "merge", "--no-edit", "-q", `origin/${base}`) !== null) lines.push(`${base} updated with ${behind} commit${behind > 1 ? "s" : ""} from GitHub`);
    else { Bun.spawnSync(["git", "merge", "--abort"], { cwd: root }); lines.push(`${base} could not be updated from GitHub without a conflict; nothing was changed`); }
  }
  for (const [id, pr] of prs) {
    if (pr.state !== "MERGED" || !hasRef(root, `refs/heads/${branchOf(id)}`) || existsSync(worktreeOf(root, id))) continue;
    git(root, "branch", "-D", branchOf(id));
    lines.push(`${id}: merged on GitHub; local branch removed`);
  }
  // A combined pull request merged: its own branch, and every task branch whose work is now in the base branch, are done.
  for (const [id, pr] of prs) {
    if (!BATCH.test(id) || pr.state !== "MERGED") continue;
    if (hasRef(root, `refs/heads/factory/${id}`)) git(root, "branch", "-D", `factory/${id}`);
    for (const t of pr.tasks ?? []) {
      if (!hasRef(root, `refs/heads/${branchOf(t)}`) || existsSync(worktreeOf(root, t))) continue;
      if (tryGit(root, "merge-base", "--is-ancestor", branchOf(t), "HEAD") === null) { lines.push(`${t}: merged on GitHub with ${id}, but ${base} here does not have it yet (Sync again once ${base} is up to date)`); continue; }
      git(root, "branch", "-D", branchOf(t));
      lines.push(`${t}: merged on GitHub (with ${id}); local branch removed`);
    }
  }
  return lines;
}

/** Merges a task's pull request (a person asked for it, or auto-merge is on). Refuses on failing checks or conflicts. */
export function mergeTask(root: string, id: string): string[] {
  need(root);
  const prs = listPrs(root);
  const pr = prs?.get(id);
  if (!prs || !pr || pr.state !== "OPEN") throw new Error(`${id} has no open pull request`);
  if (pr.checks === "failing") throw new Error(`the checks on ${id} are failing, so it was not merged. Fix them first (or merge on GitHub if you know better)`);
  if (!pr.mergeable) throw new Error(`${id} conflicts with ${baseBranch(root)}, so it was not merged. Rebuild it: factory discard, then factory run`);
  const r = gh(root, "pr", "merge", String(pr.number), "--merge", "--delete-branch");
  if (r.code !== 0) throw new Error(`GitHub refused the merge: ${r.err}`);
  prs.set(id, { ...pr, state: "MERGED" });
  return [`${id}: pull request #${pr.number} merged`, ...tidy(root, prs)];
}

/** Brings this project up to date with GitHub: merges what auto-merge allows, pulls merged work in, and removes finished branches. */
export function syncGithub(root: string, autoMerge: boolean): string[] {
  need(root);
  const prs = listPrs(root);
  if (!prs) throw new Error("GitHub did not answer");
  const lines: string[] = [];
  if (autoMerge) for (const [id, pr] of prs) {
    if (pr.state !== "OPEN" || pr.checks !== "passing" || !pr.mergeable) continue;
    const r = gh(root, "pr", "merge", String(pr.number), "--merge", "--delete-branch");
    if (r.code === 0) { prs.set(id, { ...pr, state: "MERGED" }); lines.push(`${id}: checks passed, pull request #${pr.number} merged`); }
    else lines.push(`${id}: could not be merged: ${r.err}`);
  }
  return [...lines, ...tidy(root, prs)];
}

/** Asks GitHub to merge the pull request itself once its checks pass. False when the repository does not allow that; sync covers it then. */
export const armAutoMerge = (root: string, url: string) => gh(root, "pr", "merge", url, "--auto", "--merge", "--delete-branch").code === 0;

/** Auto-merge waits for checks, so it needs some: a project with no workflow has nothing to wait for and would merge at once. */
export function hasChecks(root: string): boolean {
  const dir = join(root, ".github", "workflows");
  return existsSync(dir) && readdirSync(dir).some((f) => /\.ya?ml$/.test(f));
}

/** The spec and review a task's last run produced, for the pull request text. */
export function runTexts(store: { output(task: string, stage: string): string | undefined }, task: string): { spec: string; review: string } {
  return { spec: store.output(task, "spec") ?? "", review: store.output(task, "review") ?? "" };
}

/** A backlog item for the checks that failed on a pull request: what to fix and where the logs are. */
export function failingChecksItem(id: string, pr: Pr): { title: string; detail: string } {
  const failing = pr.checkList.filter((c) => c.state === "failing");
  if (!failing.length) throw new Error(`no failing checks on ${id}`);
  return {
    title: `Fix failing checks on ${id} (pull request #${pr.number}): ${failing.map((c) => c.name).join(", ")}`,
    detail: [`Pull request: ${pr.url}`, ...failing.map((c) => `Failing: ${c.name}${c.url ? ` (${c.url})` : ""}`), "Read the logs at the links, fix the cause, and the checks should pass."].join("\n"),
  };
}

// The merge commit that landed a task: a local `Merge F-001: title`, or GitHub's `Merge pull request #7 from user/factory/F-001`.
function mergeOf(root: string, id: string): string | null {
  const re = new RegExp(`factory/${id}(?!\\d)`);
  for (const line of (tryGit(root, "log", "--merges", "-n", "300", "--format=%H%x09%s") ?? "").split("\n")) {
    const [sha, subject = ""] = line.split("\t");
    if (subject.startsWith(`Merge ${id}:`) || re.test(subject)) return sha!;
  }
  return null;
}

/**
 * Undoes a merged task. Without a remote the revert is committed on the current branch. With one it is prepared on the task's own
 * branch (in a throwaway worktree, so your checkout does not move) and goes up like any task: you push it, and merge its pull request.
 */
export function revertTask(root: string, id: string): string {
  const merge = mergeOf(root, id), base = baseBranch(root), branch = branchOf(id);
  if (!merge) throw new Error(`${id} was not merged into ${base}, so there is nothing to revert`);
  const conflict = `${id} could not be reverted without a conflict (later work builds on it); nothing was changed`;
  if (!remoteUrl(root)) {
    if (tryGit(root, "status", "--porcelain")) throw new Error("this project has uncommitted changes. Commit or set them aside first");
    try { git(root, "revert", "-m", "1", "--no-edit", merge); } catch { Bun.spawnSync(["git", "revert", "--abort"], { cwd: root }); throw new Error(conflict); }
    return `${id} reverted on ${base}`;
  }
  if (hasRef(root, `refs/heads/${branch}`)) throw new Error(`${id} still has a branch. Merge or discard that first`);
  const dir = join(root, ".worktrees", `revert-${id}`);
  git(root, "worktree", "add", "-q", "-b", branch, dir, base);
  try {
    git(dir, "revert", "-m", "1", "--no-edit", merge);
  } catch {
    Bun.spawnSync(["git", "revert", "--abort"], { cwd: dir });
    git(root, "worktree", "remove", "--force", dir); git(root, "branch", "-D", branch);
    throw new Error(conflict);
  }
  git(root, "worktree", "remove", "--force", dir);
  return `A revert of ${id} is ready on branch ${branch}. Push it (the Push button, or: factory push ${id}) to open a pull request that undoes it, then merge that. Nothing is pushed until you do.`;
}

/** A GitHub Actions workflow that runs the project's setup and gate commands, so a pull request has checks to wait for. null with no gate. */
export function ciWorkflow(stack: string, setup: string[], gate: string[]): string | null {
  if (!gate.length) return null;
  const runtime =
    stack.includes("(bun)") ? ["uses: oven-sh/setup-bun@v2"]
    : stack.includes("(pnpm)") || stack.includes("(yarn)") ? ["uses: actions/setup-node@v4\n        with:\n          node-version: lts/*", "run: corepack enable"]
    : stack.startsWith("JavaScript") ? ["uses: actions/setup-node@v4\n        with:\n          node-version: lts/*"]
    : stack === "Python" ? [setup.some((c) => c.startsWith("uv ")) ? "uses: astral-sh/setup-uv@v5" : "uses: actions/setup-python@v5\n        with:\n          python-version: \"3.x\""]
    : stack === "Go" ? ["uses: actions/setup-go@v5\n        with:\n          go-version: stable"]
    : []; // Rust and make projects run on the runner as it is
  const step = (s: string) => `      - ${s}`;
  const run = (cmd: string) => `      - run: |\n          ${cmd.replace(/\n/g, "\n          ")}`;
  return [
    "# Written by the software factory from this project's setup and gate commands. Edit it freely.",
    "name: checks", "on:", "  pull_request:", "  push:", "    branches: [main]", "jobs:", "  gate:", "    runs-on: ubuntu-latest", "    steps:",
    step("uses: actions/checkout@v4"), ...runtime.map(step), ...[...setup, ...gate].map(run), "",
  ].join("\n");
}

/** Closes a task's open pull request and deletes its branch on GitHub (a rebuild starts from today's main). Nothing else on GitHub is touched. */
export function closeTask(root: string, id: string): string | null {
  const pr = listPrs(root)?.get(id);
  if (!pr || pr.state !== "OPEN") return null;
  const r = gh(root, "pr", "close", String(pr.number), "--delete-branch", "--comment", `Closed by the person using the software factory: ${id} is rebuilt on today's ${baseBranch(root)}.`);
  if (r.code !== 0) throw new Error(`GitHub would not close pull request #${pr.number}: ${r.err}`);
  return `pull request #${pr.number} closed`;
}

/**
 * Keeps the project's own branch level with GitHub, for a person who never runs git: takes in what GitHub has that this folder lacks (a clean merge only),
 * then pushes what only this folder has (the factory's backlog and record commits). A plain push: never forced, never a branch GitHub does not have yet.
 * Returns a sentence when it did something, undefined when the two already match, and throws when it cannot (a clash, uncommitted work).
 */
export function levelWithGitHub(root: string): string | undefined {
  const base = baseBranch(root);
  if (!hasRef(root, `refs/remotes/origin/${base}`)) return undefined;
  git(root, "fetch", "-q", "origin");
  const count = (range: string) => Number(tryGit(root, "rev-list", "--count", range) ?? 0);
  const behind = count(`HEAD..origin/${base}`);
  const did: string[] = [];
  if (behind) {
    if (tryGit(root, "status", "--porcelain", "--untracked-files=no")) throw new Error(`${base} is ${behind} commit${behind > 1 ? "s" : ""} behind GitHub, but this folder has uncommitted changes, so it was not updated`);
    if (tryGit(root, "merge", "--no-edit", "-q", `origin/${base}`) === null) { Bun.spawnSync(["git", "merge", "--abort"], { cwd: root }); throw new Error(`${base} could not be updated from GitHub without a conflict; nothing was changed`); }
    did.push(`took ${behind} commit${behind > 1 ? "s" : ""} from GitHub`);
  }
  const ahead = count(`origin/${base}..HEAD`);
  if (ahead) {
    try { git(root, "push", "-q", "origin", base); } catch (e) { throw new Error(`${base} was not pushed: ${(e as Error).message.split("\n")[0]}`); }
    did.push(`pushed ${ahead} commit${ahead > 1 ? "s" : ""}`);
  }
  return did.length ? `${base} brought level with GitHub (${did.join(", ")}).` : undefined;
}
