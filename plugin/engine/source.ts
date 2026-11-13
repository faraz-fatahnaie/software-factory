// What the Source view shows: the history of the main branch grouped by task, the branches in flight, and work that is not saved yet.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { holderOf, type Preset } from "./team";
import { baseBranch, remoteUrl } from "./vcs";
import { git, worktreeOf } from "./worktree";

export type Kind = "task" | "merge" | "revert" | "record" | "factory" | "person";
export type Commit = { sha: string; subject: string; date: string; kind: Kind; task?: string; role?: string };
export type Lane = { id: string; ahead: number; inProgress: boolean; pushed: boolean; revert: boolean; date: string };
/** A changed file as VS Code lists it: M modified, A added, D deleted, R renamed, U untracked. */
export type Change = { path: string; status: "M" | "A" | "D" | "R" | "U"; added: number; removed: number };

/** Lines added and removed per file in a `--numstat` listing. Binary files (shown as "-") count as 0. */
function numstat(text: string): Map<string, { added: number; removed: number }> {
  const out = new Map<string, { added: number; removed: number }>();
  for (const line of text.split("\n").filter(Boolean)) {
    const [a, r, ...path] = line.split("\t");
    out.set(path.at(-1)!.replace(/^.*\{.* => (.*)\}.*$/, "$1"), { added: Number(a) || 0, removed: Number(r) || 0 });
  }
  return out;
}

/** Lines in an untracked text file, counted as added (git does not diff files it does not know). Large or binary files count 0. */
function lineCount(root: string, path: string): number {
  try {
    const file = join(root, path);
    if (statSync(file).size > 200_000) return 0;
    const text = readFileSync(file, "utf8");
    return text.includes("\0") ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  } catch { return 0; }
}

/** Reads `git status --porcelain`, with how many lines each file gained and lost. Raw output: the first column can be a space, which trimming would eat. */
export function changedFiles(root: string): Change[] {
  const out = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], { cwd: root, stdout: "pipe", stderr: "pipe" }).stdout.toString();
  const counts = numstat(tryGit(root, "diff", "HEAD", "--numstat") ?? "");
  return out.split("\n").filter(Boolean).map((line) => {
    const xy = line.slice(0, 2), letter = xy === "??" ? "U" : xy.trim()[0]!, path = line.slice(3).split(" -> ").at(-1)!;
    const status = ("MADRU".includes(letter) ? letter : "M") as Change["status"];
    const n = status === "U" ? { added: lineCount(root, path), removed: 0 } : counts.get(path) ?? { added: 0, removed: 0 };
    return { path, status, ...n };
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
    dirty: { count: changes.length, files: changes.slice(0, 300) },
    commits, lanes,
  };
}

// ---------- Commit graph: every commit on every branch, with the lanes that join them ----------

export type Ref = { name: string; kind: "branch" | "remote" | "tag" | "head"; head?: boolean };
export type Layout = { col: number; converge: number[]; through: number[]; out: number[] };
export type GraphRow = Commit & { short: string; parents: string[]; refs: Ref[]; author: string } & Layout;

/** Reads git's decoration text (`HEAD -> main, origin/main, tag: v1.0.0`) into labelled refs. */
export function parseRefs(decoration: string): Ref[] {
  return decoration.split(", ").map((d) => d.trim()).filter((d) => d && !/^origin\/HEAD$/.test(d)).map((d): Ref => {
    if (d.startsWith("HEAD -> ")) return { name: d.slice(8), kind: "branch", head: true };
    if (d === "HEAD") return { name: "HEAD", kind: "head", head: true };
    if (d.startsWith("tag: ")) return { name: d.slice(5), kind: "tag" };
    return { name: d, kind: d.startsWith("origin/") ? "remote" : "branch" };
  });
}

/**
 * Lays commits (newest first, parents after children) onto lanes. A lane is a line waiting for one particular commit.
 * Per row: the lane the commit sits in, the lanes that end at it (`converge`: branches joining), the lanes that pass by
 * untouched (`through`), and the lanes it opens towards its parents (`out`: the first parent continues, others are merges).
 */
export function layoutGraph(rows: { sha: string; parents: string[] }[]): Layout[] {
  const lanes: (string | null)[] = [];
  const free = () => { const i = lanes.indexOf(null); return i < 0 ? lanes.length : i; };
  return rows.map(({ sha, parents }) => {
    const waiting = lanes.map((s, i) => (s === sha ? i : -1)).filter((i) => i >= 0);
    const col = waiting[0] ?? free();
    const through = lanes.flatMap((s, i) => (s !== null && s !== sha ? [i] : []));
    for (const i of waiting) lanes[i] = null;
    const out: number[] = [];
    parents.forEach((parent, n) => {
      let lane = lanes.indexOf(parent);
      if (lane < 0) { lane = n === 0 ? col : free(); lanes[lane] = parent; } // a parent nobody waits for yet: the first continues straight
      out.push(lane);
    });
    while (lanes.length && lanes.at(-1) === null) lanes.pop();
    return { col, converge: waiting, through, out };
  });
}

/**
 * For a search: the parents of each kept commit, rewritten to its nearest kept ancestors, so the lanes stay connected
 * across the commits that were filtered out. `rows` are newest first, children before parents (`--topo-order`).
 */
export function rewriteParents(rows: { sha: string; parents: string[] }[], keep: (sha: string) => boolean): Map<string, string[]> {
  const nearest = new Map<string, string[]>(); // for any commit: the kept commits first reached going back from it
  const out = new Map<string, string[]>();
  for (const r of [...rows].reverse()) {
    const up = [...new Set(r.parents.flatMap((p) => nearest.get(p) ?? []))]; // a parent beyond the commits read is dropped
    nearest.set(r.sha, keep(r.sha) ? [r.sha] : up);
    if (keep(r.sha)) out.set(r.sha, up);
  }
  return out;
}

const MAX_SEARCHED = 5000;

/** Does a commit match what was typed? Message, author, a hash prefix, a branch or tag name, or a task id; case does not matter. */
export function matchesQuery(r: { sha: string; subject: string; author: string; refs: Ref[]; task?: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (/^[0-9a-f]{4,40}$/.test(q) && r.sha.startsWith(q)) || r.subject.toLowerCase().includes(q) || r.author.toLowerCase().includes(q)
    || r.refs.some((f) => f.name.toLowerCase().includes(q)) || r.task?.toLowerCase() === q;
}

/**
 * The newest commits on every branch, remote branch and tag (or on one branch), laid out for drawing. With a `query`, the whole
 * history is searched and only matching commits are shown, joined through the ones that were left out. `matches` counts them all.
 */
export function graphInfo(root: string, team: Preset, limit = 80, branch?: string, query = ""): { rows: GraphRow[]; lanes: number; matches?: number } {
  // One branch (and what it came from), or every branch. A branch name is checked against real refs before it reaches git.
  if (branch !== undefined && (!/^[\w./-]{1,100}$/.test(branch) || branch.startsWith("-") || (tryGit(root, "rev-parse", "--verify", "-q", `refs/heads/${branch}`) ?? tryGit(root, "rev-parse", "--verify", "-q", `refs/remotes/${branch}`)) === null))
    throw new Error(`no branch ${branch}`);
  if (query.length > 100) throw new Error("search: at most 100 characters");
  const searching = query.trim() !== "";
  const raw = tryGit(root, "log", ...(branch ? [branch] : ["--branches", "--remotes", "--tags", "HEAD"]), "--topo-order", `-n${searching ? MAX_SEARCHED : limit}`, "--format=%H%x09%P%x09%D%x09%cI%x09%an%x09%s") ?? "";
  const role = { task: holderOf(team, "B2"), record: holderOf(team, "K2") } as Partial<Record<Kind, string | undefined>>;
  let parsed = raw.split("\n").filter(Boolean).map((line) => {
    const [sha, parents, refs, date, author, ...rest] = line.split("\t"), subject = rest.join("\t"), c = classifyCommit(subject);
    return { sha: sha!, parents: parents ? parents.split(" ") : [], refs: parseRefs(refs ?? ""), date: date!, author: author ?? "", subject, ...c, role: role[c.kind] };
  });
  let matches: number | undefined;
  if (searching) {
    const hit = new Set(parsed.filter((r) => matchesQuery(r, query)).map((r) => r.sha));
    const rewritten = rewriteParents(parsed, (sha) => hit.has(sha));
    matches = hit.size;
    parsed = parsed.filter((r) => hit.has(r.sha)).slice(0, limit).map((r) => ({ ...r, parents: rewritten.get(r.sha) ?? [] }));
  }
  const layout = layoutGraph(parsed);
  const rows = parsed.map((r, i) => ({ ...r, short: r.sha.slice(0, 7), ...layout[i]! }));
  return { rows, lanes: Math.max(1, ...rows.map((r) => Math.max(r.col, ...r.out, ...r.through, ...r.converge) + 1)), ...(matches !== undefined && { matches }) };
}

/** One commit as the details panel shows it: the full message and the files it changed. A merge is compared with its first parent. */
export function commitDetail(root: string, sha: string) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("sha: 7 to 40 hex characters");
  const head = (tryGit(root, "show", "-s", "--format=%H%x09%P%x09%an%x09%cI", sha) ?? "").split("\t");
  if (!head[0]) throw new Error(`no commit ${sha}`);
  const parents = head[1] ? head[1].split(" ") : [];
  const names = parents.length > 1 ? tryGit(root, "diff", "--name-status", "-M", `${sha}^1`, sha) : tryGit(root, "show", "--name-status", "--format=", "-M", sha);
  const counts = numstat((parents.length > 1 ? tryGit(root, "diff", "--numstat", `${sha}^1`, sha) : tryGit(root, "show", "--numstat", "--format=", sha)) ?? "");
  const files = (names ?? "").split("\n").filter(Boolean).map((l) => {
    const [status = "M", ...paths] = l.split("\t"), path = paths.at(-1)!;
    return { status: ("MADR".includes(status[0]!) ? status[0]! : "M") as Exclude<Change["status"], "U">, path, ...(counts.get(path) ?? { added: 0, removed: 0 }) };
  });
  return { sha: head[0], parents, author: head[2] ?? "", date: head[3] ?? "", message: tryGit(root, "show", "-s", "--format=%B", sha) ?? "", files };
}

/**
 * The unified diff of one file: what changed in the working copy (untracked files show as all added), or what a commit changed in it
 * (a merge is compared with its first parent). The path and commit are checked before they reach git, and the text is capped.
 */
export function fileDiff(root: string, path: string, sha?: string): string {
  if (!path || path.length > 300 || path.startsWith("-") || path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) throw new Error("path: a file inside the project");
  const run = (args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" }).stdout.toString();
  let text: string;
  if (sha !== undefined) {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("sha: 7 to 40 hex characters");
    const merge = (tryGit(root, "show", "-s", "--format=%P", sha) ?? "").includes(" ");
    text = merge ? run(["diff", "--no-color", "-U3", `${sha}^1`, sha, "--", path]) : run(["show", "--no-color", "-U3", "--format=", sha, "--", path]);
  } else {
    const untracked = changedFiles(root).find((c) => c.path === path)?.status === "U";
    text = untracked ? run(["diff", "--no-color", "-U3", "--no-index", "--", "/dev/null", path]) : run(["diff", "HEAD", "--no-color", "-U3", "--", path]);
  }
  return text.length > 300_000 ? `${text.slice(0, 300_000)}\n… the rest of this diff is not shown` : text;
}
