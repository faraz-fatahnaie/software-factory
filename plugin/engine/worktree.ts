import { existsSync } from "node:fs";
import { join } from "node:path";

// Ids come from parsed backlog items (F-<digits>), so they are safe in paths and branch names.
export const branchOf = (id: string) => `factory/${id}`;
export const worktreeOf = (root: string, id: string) => join(root, ".worktrees", id);

export function git(cwd: string, ...args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

/** One isolated checkout per task, branched from HEAD. Reused if it exists (re-run of a Blocked item). */
export function ensureWorktree(root: string, id: string): string {
  const dir = worktreeOf(root, id);
  if (!existsSync(dir)) git(root, "worktree", "add", "-q", "-b", branchOf(id), dir, "HEAD");
  return dir;
}

/** Every task worktree, with how far its branch is ahead and how much is uncommitted. */
export function listWorktrees(root: string) {
  return git(root, "worktree", "list", "--porcelain").split("\n\n").flatMap((block) => {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const id = block.match(/^branch refs\/heads\/factory\/(F-\d+)$/m)?.[1];
    if (!path || !id) return [];
    return [{
      id,
      path,
      branch: branchOf(id),
      ahead: Number(git(root, "rev-list", "--count", `HEAD..${branchOf(id)}`)),
      uncommitted: git(path, "status", "--porcelain").split("\n").filter(Boolean).length,
    }];
  });
}

/** How many commits the base branch has that the task's branch lacks: how far main moved on while the task waited. The factory's own backlog commits do not count. */
export const behindBy = (root: string, id: string) => Number(git(root, "rev-list", "--count", `${branchOf(id)}..HEAD`, "--", ".", ":(exclude)BACKLOG.md"));

/**
 * Merges the base branch into the task's branch, in the task's folder only (nothing is pushed, main is untouched).
 * Returns the files that clash: none means it merged cleanly. A clash leaves the merge open for the Builder to resolve; `abortUpdate` undoes it.
 */
export function mergeBase(dir: string, base: string): string[] {
  const p = Bun.spawnSync(["git", "merge", "--no-edit", "-q", base], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode === 0) return [];
  const clash = git(dir, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  if (!clash.length) { abortUpdate(dir); throw new Error(`could not merge ${base} into the task: ${p.stderr.toString().trim()}`); }
  return clash;
}

/** Puts the task's branch back as it was before `mergeBase`, whether the merge is open (a clash) or finished (a clean merge whose checks failed). */
export function abortUpdate(dir: string) {
  if (Bun.spawnSync(["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: dir }).exitCode === 0) git(dir, "merge", "--abort");
  else git(dir, "reset", "--hard", "-q", "ORIG_HEAD");
}

/** Files, among `files`, that still hold conflict markers. */
export function unresolved(dir: string, files: string[]): string[] {
  const p = Bun.spawnSync(["git", "grep", "-l", "-E", "^(<<<<<<<|>>>>>>>) ", "--", ...files], { cwd: dir, stdout: "pipe" });
  return p.stdout.toString().split("\n").filter(Boolean);
}

/** Commits everything in the worktree. Agents never run git writes; the orchestrator does. */
export function commitAll(dir: string, message: string): boolean {
  git(dir, "add", "-A");
  if (!git(dir, "status", "--porcelain")) return false;
  git(dir, "commit", "-q", "-m", message);
  return true;
}

/** Deletes the task's checkout and local branch, including any uncommitted work in it. */
export function removeWorktree(root: string, id: string, keepBranch = false) {
  if (existsSync(worktreeOf(root, id))) git(root, "worktree", "remove", "--force", worktreeOf(root, id));
  git(root, "worktree", "prune");
  if (!keepBranch) Bun.spawnSync(["git", "branch", "-D", branchOf(id)], { cwd: root }); // absent branch is fine
}

export const APPROVED = "approved; not pushed yet";

/**
 * Lands an approved task. With an `origin` nothing leaves this machine: the branch is kept and a person pushes it (`factory push`),
 * which opens a pull request they merge. Without one, it merges locally.
 */
export function land(root: string, id: string, title: string): string {
  if (git(root, "remote").split("\n").includes("origin")) return APPROVED;
  const subject = `${id}: ${title}`;
  try {
    git(root, "merge", "--no-ff", "-q", "-m", `Merge ${subject}`, branchOf(id));
  } catch {
    Bun.spawnSync(["git", "merge", "--abort"], { cwd: root });
    throw new Error(`${id} conflicts with work that landed after it was built; nothing was merged. Update it from main: factory update ${id}`);
  }
  return "merged locally";
}
