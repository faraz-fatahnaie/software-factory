import { existsSync } from "node:fs";
import { join } from "node:path";

// Ids come from parsed backlog items (F-<digits>), so they are safe in paths and branch names.
const branchOf = (id: string) => `factory/${id}`;
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

/** Commits everything in the worktree. Agents never run git writes; the orchestrator does. */
export function commitAll(dir: string, message: string): boolean {
  git(dir, "add", "-A");
  if (!git(dir, "status", "--porcelain")) return false;
  git(dir, "commit", "-q", "-m", message);
  return true;
}

/** Deletes the task's checkout and local branch, including any uncommitted work in it. */
export function removeWorktree(root: string, id: string) {
  if (existsSync(worktreeOf(root, id))) git(root, "worktree", "remove", "--force", worktreeOf(root, id));
  git(root, "worktree", "prune");
  Bun.spawnSync(["git", "branch", "-D", branchOf(id)], { cwd: root }); // absent branch is fine
}

/** Lands an approved task: a pull request when the repo has an `origin`, else a local merge. */
export function land(root: string, id: string, title: string): string {
  const subject = `${id}: ${title}`;
  if (git(root, "remote").split("\n").includes("origin")) {
    git(root, "push", "-q", "-u", "origin", branchOf(id));
    const p = Bun.spawnSync(
      ["gh", "pr", "create", "--head", branchOf(id), "--title", subject, "--body", `Built by the software factory from backlog item ${id}.`],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    if (p.exitCode !== 0) throw new Error(`gh pr create failed: ${p.stderr.toString().trim()}`);
    return p.stdout.toString().trim(); // the pull request URL
  }
  try {
    git(root, "merge", "--no-ff", "-q", "-m", `Merge ${subject}`, branchOf(id));
  } catch {
    Bun.spawnSync(["git", "merge", "--abort"], { cwd: root });
    // ponytail: no automatic rebase. Rebuilding from the new HEAD is the simple, correct path.
    throw new Error(`${id} conflicts with work that landed after it was built; nothing was merged. Rebuild it: factory discard ${id}, then factory run ${id}`);
  }
  return "merged locally";
}
