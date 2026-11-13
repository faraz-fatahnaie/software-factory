// What the Source view shows: the history of the main branch grouped by task, the branches in flight, and work that is not saved yet.
import { existsSync } from "node:fs";
import { holderOf, type Preset } from "./team";
import { baseBranch, remoteUrl } from "./vcs";
import { git, worktreeOf } from "./worktree";

export type Kind = "task" | "merge" | "revert" | "record" | "factory" | "person";
export type Commit = { sha: string; subject: string; date: string; kind: Kind; task?: string; role?: string };
export type Lane = { id: string; ahead: number; inProgress: boolean; pushed: boolean; revert: boolean; date: string };
/** A changed file as VS Code lists it: M modified, A added, D deleted, R renamed, U untracked. */
export type Change = { path: string; status: "M" | "A" | "D" | "R" | "U" };

/** Reads `git status --porcelain`. Raw output: the first column can be a space, which trimming would eat. */
export function changedFiles(root: string): Change[] {
  const out = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe", stderr: "pipe" }).stdout.toString();
  return out.split("\n").filter(Boolean).map((line) => {
    const xy = line.slice(0, 2), letter = xy === "??" ? "U" : xy.trim()[0]!;
    return { path: line.slice(3).split(" -> ").at(-1)!, status: ("MADRU".includes(letter) ? letter : "M") as Change["status"] };
  });
}

/** Who made a commit and for which task, from its message. The factory's own commits all have a recognisable shape. */
export function classifyCommit(subject: string): { kind: Kind; task?: string } {
  const task = (re: RegExp) => re.exec(subject)?.[1];
  const merged = task(/^Merge pull request #\d+ from \S+\/factory\/(F-\d+)/) ?? task(/^Merge (F-\d+):/);
  if (merged) return { kind: "merge", task: merged };
  const reverted = task(/^Revert "Merge pull request #\d+ from \S+\/factory\/(F-\d+)/) ?? task(/^Revert "Merge (F-\d+):/) ?? task(/^Revert (F-\d+):/);
  if (reverted) return { kind: "revert", task: reverted };
  const built = task(/^(F-\d+): /);
  if (built) return { kind: "task", task: built };
  const recorded = task(/^software-factory: record (F-\d+)/);
  if (recorded) return { kind: "record", task: recorded };
  if (/^(backlog|software-factory|skills): /.test(subject)) return { kind: "factory" };
  return { kind: "person" };
}

const tryGit = (cwd: string, ...args: string[]) => { try { return git(cwd, ...args); } catch { return null; } };

export function sourceInfo(root: string, team: Preset, limit = 60) {
  const base = baseBranch(root), upstream = `origin/${base}`;
  // The role behind a kind of commit follows the team: whoever holds the build job made the task commits, whoever holds the summary job wrote the record.
  const role = { task: holderOf(team, "B2"), record: holderOf(team, "K2") } as Partial<Record<Kind, string | undefined>>;
  const commits: Commit[] = (tryGit(root, "log", `-n${limit}`, "--format=%H%x09%cI%x09%s") ?? "").split("\n").filter(Boolean).map((line) => {
    const [sha, date, ...rest] = line.split("\t"), subject = rest.join("\t");
    const c = classifyCommit(subject);
    return { sha: sha!.slice(0, 8), subject, date: date!, ...c, role: role[c.kind] };
  });
  const changes = changedFiles(root);
  const lanes: Lane[] = (tryGit(root, "for-each-ref", "--format=%(refname:short)", "refs/heads/factory/") ?? "").split("\n").filter(Boolean).flatMap((ref) => {
    const id = ref.slice("factory/".length);
    if (!/^F-\d+$/.test(id)) return [];
    return [{
      id, ahead: Number(tryGit(root, "rev-list", "--count", `${base}..${ref}`) ?? 0), inProgress: existsSync(worktreeOf(root, id)),
      pushed: tryGit(root, "rev-parse", "--verify", "-q", `refs/remotes/origin/${ref}`) !== null,
      revert: (tryGit(root, "log", "-1", "--format=%s", ref) ?? "").startsWith("Revert "),
      date: tryGit(root, "log", "-1", "--format=%cI", ref) ?? "",
    }];
  });
  const hasUpstream = remoteUrl(root) && tryGit(root, "rev-parse", "--verify", "-q", `refs/remotes/${upstream}`) !== null;
  return {
    branch: base,
    // main is never pushed directly: this count is bookkeeping that travels in the next pull request.
    ahead: hasUpstream ? Number(tryGit(root, "rev-list", "--count", `${upstream}..HEAD`) ?? 0) : null,
    behind: hasUpstream ? Number(tryGit(root, "rev-list", "--count", `HEAD..${upstream}`) ?? 0) : null,
    dirty: { count: changes.length, files: changes.slice(0, 50) },
    commits, lanes,
  };
}
