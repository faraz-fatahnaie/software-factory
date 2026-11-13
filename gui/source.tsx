// Source, laid out the way VS Code and GitHub show version control: a status line, a list of changes with M/A/D/U letters,
// a branches table, and commits grouped by day. A task's commits read as one story, with the robot that made them.
import { useEffect, useMemo, useState } from "react";
import { call, type Item } from "./data";
import { Icon } from "./icons";
import { Robot } from "./robots";
import { ViewSkeleton } from "./ui";
import { StateIcon, type VcsData } from "./vcs";

type Commit = { sha: string; subject: string; date: string; kind: "task" | "merge" | "revert" | "record" | "factory" | "person"; task?: string; role?: string };
type Lane = { id: string; ahead: number; inProgress: boolean; pushed: boolean; revert: boolean; date: string };
type Change = { path: string; status: "M" | "A" | "D" | "R" | "U" };
type SourceData = { branch: string; ahead: number | null; behind: number | null; dirty: { count: number; files: Change[] }; commits: Commit[]; lanes: Lane[] };
type Group = { task?: string; commits: Commit[] };

const BY = { task: "Built by the team", merge: "Merged", revert: "Reverted", record: "Recorded by the Scribe", factory: "The factory", person: "You" } as const;
const LETTER = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", U: "Untracked" } as const;

/** "3 hours ago", as GitHub says it. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const [n, unit] = s < 60 ? [s, "second"] : s < 3600 ? [Math.floor(s / 60), "minute"] : s < 86_400 ? [Math.floor(s / 3600), "hour"] : s < 2_592_000 ? [Math.floor(s / 86_400), "day"] : [Math.floor(s / 2_592_000), "month"];
  return s < 10 ? "just now" : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** Neighbouring commits of one task become one group, so a task reads as one story: its build, its merge, its record. */
function group(commits: Commit[]): Group[] {
  const out: Group[] = [];
  for (const c of commits) {
    const last = out.at(-1);
    if (c.task && last?.task === c.task) last.commits.push(c);
    else out.push({ task: c.task, commits: [c] });
  }
  return out;
}

/** `https://github.com/owner/repo.git` or `git@github.com:owner/repo.git` as owner/repo. */
const repoOf = (remote: string | null) => /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote ?? "")?.[1];

export function Source(p: { items: Item[]; vcs: VcsData | null; act: (path: string, body: unknown) => Promise<boolean>; refreshVcs: () => Promise<void>; open: (id: string) => void }) {
  const [src, setSrc] = useState<SourceData | null>(null);
  const [busy, setBusy] = useState("");
  const load = () => call<SourceData>("/api/source").then((r) => r.ok && setSrc(r.data));
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, []);
  const days = useMemo(() => {
    const out = new Map<string, Group[]>();
    for (const g of group(src?.commits ?? [])) {
      const day = new Date(g.commits[0]!.date).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
      out.set(day, [...(out.get(day) ?? []), g]);
    }
    return [...out];
  }, [src]);
  // A task is reverted when a revert commit for it is newer than its merge (the list is newest first).
  const reverted = useMemo(() => {
    const done = new Set<string>(), seen = new Set<string>();
    for (const c of src?.commits ?? []) {
      if (!c.task) continue;
      if (c.kind === "revert") seen.add(c.task);
      if (c.kind === "merge" && seen.has(c.task)) done.add(c.task);
    }
    return done;
  }, [src]);
  const title = (id: string) => p.items.find((i) => i.id === id)?.title ?? "";
  const revert = async (id: string) => {
    if (!confirm(`Revert ${id}? This prepares a change that undoes it. Nothing is pushed or merged until you do that yourself.`)) return;
    setBusy(id);
    await p.act("/api/revert", { id });
    await Promise.all([load(), p.refreshVcs()]);
    setBusy("");
  };
  const pr = (id: string) => p.vcs?.branches.find((b) => b.id === id)?.pr;

  if (!src) return <ViewSkeleton kind="list" />;
  const repo = repoOf(p.vcs?.remote ?? null);
  return (
    <div className="scm source">
      <div className="statusbar" role="status" aria-label="Branch status">
        <span><Icon name="branch" /> <b>{src.branch}</b></span>
        {src.ahead !== null && <span title="Commits on main that are not on GitHub (they travel in the next pull request) / commits on GitHub that are not here"><Icon name="sync" /> {src.behind}<Icon name="down" /> {src.ahead}<Icon name="up" /></span>}
        <span className="grow" />
        {repo ? <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a> : <span className="note">{p.vcs?.remote ? p.vcs.remote : "Not on GitHub"}</span>}
      </div>

      <div className="col">
        <section className="tile changes" aria-label="Changes">
          <h2 className="sec-head"><Icon name="chevron" size={14} /> Changes <span className="count">{src.dirty.count}</span></h2>
          {src.dirty.count === 0 ? <p className="empty">No changes. Your files match the last saved commit.</p> : (
            <>
              <p className="note">Tasks start from the last saved commit, so these changes are not part of any new task. Save them with git when they are ready.</p>
              <ul>
                {src.dirty.files.map((f) => {
                  const name = f.path.split("/").at(-1)!, dir = f.path.slice(0, f.path.length - name.length - (f.path.includes("/") ? 1 : 0));
                  return (
                    <li key={f.path} title={`${LETTER[f.status]}: ${f.path}`}>
                      <Icon name="file" /><span className="file">{name}{dir && <span className="dir">{dir}</span>}</span>
                      <span className={`letter ${f.status}`} aria-label={LETTER[f.status]}>{f.status}</span>
                    </li>
                  );
                })}
              </ul>
              {src.dirty.count > src.dirty.files.length && <p className="note">and {src.dirty.count - src.dirty.files.length} more</p>}
            </>
          )}
        </section>

        <section className="tile branches-table" aria-label="Branches">
          <h2 className="sec-head"><Icon name="chevron" size={14} /> Branches <span className="count">{src.lanes.length + 1}</span></h2>
          <ul>
            <li><Icon name="branch" size={15} /><span className="branch-pill">{src.branch}</span><span className="default-tag">Default</span></li>
            {src.lanes.map((l) => {
              const info = pr(l.id);
              return (
                <li key={l.id}>
                  {info?.state === "OPEN" ? <StateIcon kind="open" /> : <Icon name="branch" size={15} />}
                  <span className="branch-pill">factory/{l.id}</span>
                  {l.ahead > 0 && <span className="ahead" title={`${l.ahead} commit${l.ahead === 1 ? "" : "s"} ahead of ${src.branch}`}>+{l.ahead}</span>}
                  <span className="upd" title={l.date}>{l.date ? `Updated ${ago(l.date)}` : ""}</span>
                  <span className="note" style={{ flexBasis: "100%" }}>
                    <button className="quiet linkish" onClick={() => p.open(l.id)}>{l.id}</button> {title(l.id)} ·{" "}
                    {l.inProgress ? "Being worked on" : info?.state === "OPEN" ? `Pull request #${info.number}` : l.pushed ? "On GitHub" : l.revert ? "A revert, only here" : "Approved, only here"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="tile timeline" aria-label="Commits">
        <h2 className="sec-head">Commits</h2>
        {days.map(([day, groups]) => (
          <div className="commits-day" key={day}>
            <h3><Icon name="commit" /> Commits on {day}</h3>
            <div className="commit-card">
              {groups.map((g, i) => g.task ? (
                <div key={i}>
                  <div className="c-row c-task">
                    {g.commits.find((c) => c.role) ? <Robot role={g.commits.find((c) => c.role)!.role!} size={32} /> : <span className="state-icon st-local"><Icon name="commit" /></span>}
                    <div className="c-main">
                      <span className="c-msg"><button className="chip-id" onClick={() => p.open(g.task!)}>{g.task}</button> {title(g.task) || g.commits[0]!.subject}</span>
                      <span className="c-by">
                        {g.commits.some((c) => c.kind === "merge") && !reverted.has(g.task) && <span className="gh-label merged"><Icon name="merge" /> Merged</span>}
                        {reverted.has(g.task) && <span className="gh-label closed"><Icon name="undo" /> Reverted</span>}
                        {g.commits.length} commit{g.commits.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {g.commits.some((c) => c.kind === "merge") && !reverted.has(g.task) && (
                      <button disabled={busy !== ""} onClick={() => revert(g.task!)}><Icon name="undo" size={13} /> {busy === g.task ? "Reverting…" : "Revert"}</button>
                    )}
                  </div>
                  {g.commits.map((c) => <Row key={c.sha} c={c} sub />)}
                </div>
              ) : <Row key={i} c={g.commits[0]!} />)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Row({ c, sub }: { c: Commit; sub?: boolean }) {
  return (
    <div className={`c-row${sub ? " c-sub" : ""}`}>
      <div className="c-main">
        <span className="c-msg" title={c.subject}>{c.subject}</span>
        <span className="c-by">
          {c.role ? <Robot role={c.role} size={18} /> : <span className="state-icon st-local" aria-hidden="true" style={{ width: 18 }}><Icon name="dot" size={14} /></span>}
          {BY[c.kind]} · <time dateTime={c.date} title={c.date}>{ago(c.date)}</time>
        </span>
      </div>
      <button className="sha" aria-label={`Copy commit ${c.sha}`} title="Copy the commit id" onClick={() => navigator.clipboard?.writeText(c.sha)}>{c.sha.slice(0, 7)} <Icon name="copy" /></button>
    </div>
  );
}
