// GitHub in the dashboard: what is waiting to be pushed or merged, and the buttons that do it. Each button is the person's approval.
import { useState } from "react";
import type { Item } from "./data";
import { Icon } from "./icons";
import { Skel } from "./ui";

export type VcsCheck = { name: string; state: "passing" | "failing" | "pending"; url?: string };
export type VcsPr = { number: number; url: string; state: "OPEN" | "MERGED" | "CLOSED"; checks: "passing" | "failing" | "pending" | "none"; mergeable: boolean; checkList: VcsCheck[] };
export type VcsData = {
  remote: string | null; github: boolean; ghReady: boolean; base: string; note?: string; autoMerge: boolean; autoPush?: boolean; hasChecks: boolean;
  branches: { id: string; pushed: boolean; revert?: boolean; pr?: VcsPr }[];
};

/** The short status for the side rail: where this project's work lives. */
export function vcsChip(v: VcsData | null): { tone: "ok" | "warn" | "off"; text: string; title: string } {
  if (!v) return { tone: "off", text: "GitHub…", title: "Checking GitHub" };
  if (!v.remote) return { tone: "warn", text: "Not on GitHub", title: "This project has no GitHub remote, so its work exists only on this machine." };
  if (!v.ghReady) return { tone: "warn", text: "GitHub not signed in", title: "Run `gh auth login` in a terminal." };
  const waiting = v.branches.filter((b) => !b.pr || b.pr.state !== "CLOSED").length;
  return waiting
    ? { tone: "warn", text: `${waiting} waiting for GitHub`, title: "Approved work that is not merged on GitHub yet." }
    : { tone: "ok", text: "In sync with GitHub", title: "Nothing is waiting to be pushed or merged." };
}

const SUMMARY = {
  passing: { title: "All checks have passed", tone: "st-open", icon: "check" },
  failing: { title: "Some checks were not successful", tone: "st-closed", icon: "x" },
  pending: { title: "Some checks haven't completed yet", tone: "st-pending", icon: "dot" },
  none: { title: "No checks have run", tone: "st-local", icon: "dot" },
} as const;
const CHECK_STATE = { passing: ["st-open", "check", "Successful"], failing: ["st-closed", "x", "Failing"], pending: ["st-pending", "dot", "In progress"] } as const;

/** GitHub's pull request icons: green open, purple merged, red closed, and a plain branch for one that is not a pull request yet. */
export function StateIcon({ kind }: { kind: "open" | "merged" | "closed" | "local" }) {
  return <span className={`state-icon st-${kind}`} aria-hidden="true"><Icon name={kind === "merged" ? "merge" : kind === "local" ? "branch" : "pr"} /></span>;
}

/** The part of a GitHub pull request page under the title: the checks, conflicts, and the merge button. */
function MergeBox(p: { id: string; pr: VcsPr; vcs: VcsData; busy: string; run: (key: string, path: string, body: unknown) => Promise<void> }) {
  const { pr, vcs } = p, sum = SUMMARY[pr.checks];
  const count = (state: VcsCheck["state"]) => pr.checkList.filter((c) => c.state === state).length;
  return (
    <div className="merge-box">
      <div>
        <span className={`big ${sum.tone}`}><Icon name={sum.icon} /></span>
        <span className="what-text">
          <b>{sum.title}</b>
          {pr.checkList.length > 0 && <span className="note">{[count("failing") && `${count("failing")} failing`, count("pending") && `${count("pending")} in progress`, count("passing") && `${count("passing")} successful`].filter(Boolean).join(", ")} {pr.checkList.length === 1 ? "check" : "checks"}</span>}
        </span>
      </div>
      {pr.checkList.map((c) => {
        const [tone, icon, text] = CHECK_STATE[c.state];
        return (
          <div className="check" key={c.name}>
            <span className={tone}><Icon name={icon} size={14} /></span><span className="name">{c.name}</span><span className="note">{text}</span>{c.url && <a href={c.url} target="_blank" rel="noreferrer">Details</a>}
          </div>
        );
      })}
      {!pr.mergeable && (
        <div className="conflict"><span className="big"><Icon name="x" /></span><span className="what-text"><b>This branch has conflicts that must be resolved</b><span className="note">Later work changed the same lines. Rebuild the task from the new {vcs.base}: discard it, then run it again.</span></span></div>
      )}
      <div className="foot">
        {vcs.autoMerge ? <span className="note">Auto-merge is on: this merges when the checks pass.</span> : (
          <button className="gh" disabled={p.busy !== "" || pr.checks === "failing" || !pr.mergeable}
            onClick={() => confirm(`Merge pull request #${pr.number} into ${vcs.base}?`) && p.run(p.id, "/api/merge", { id: p.id })}>{p.busy === p.id ? "Merging…" : "Merge pull request"}</button>
        )}
        {pr.checks === "failing" && <button disabled={p.busy !== ""} onClick={() => p.run(`fix-${p.id}`, "/api/fix-checks", { id: p.id })} title="Adds a backlog item naming the failing checks, with links to their logs">Add to backlog</button>}
        <a href={pr.url} target="_blank" rel="noreferrer">View on GitHub</a>
      </div>
    </div>
  );
}

export function GitHub(p: { vcs: VcsData | null; items: Item[]; act: (path: string, body: unknown) => Promise<boolean>; refresh: () => Promise<void>; open: (id: string) => void }) {
  const [busy, setBusy] = useState("");
  const { vcs } = p;
  const run = async (key: string, path: string, body: unknown) => { setBusy(key); await p.act(path, body); await p.refresh(); setBusy(""); };
  // Several tasks with one yes: asked once in place, then done one after the other, stopping at the first that fails (its reason is shown).
  const [asking, setAsking] = useState<"" | "push" | "merge">("");
  const [progress, setProgress] = useState("");
  const batch = async (kind: "push" | "merge", ids: string[]) => {
    setAsking(""); setBusy(`all-${kind}`);
    for (const [i, id] of ids.entries()) {
      setProgress(`${kind === "push" ? "Pushing" : "Merging"} ${i + 1} of ${ids.length}…`);
      if (!(await p.act(`/api/${kind}`, { id }))) break;
    }
    setProgress(""); await p.refresh(); setBusy("");
  };
  const title = (id: string) => p.items.find((i) => i.id === id)?.title ?? "";

  if (!vcs) return <article className="tile github"><Skel w={160} h={14} /><div style={{ height: 12 }} /><Skel w="70%" h={14} /></article>;
  if (!vcs.remote) return (
    <article className="tile github" aria-label="Pull requests">
      <header><h2><Icon name="pr" size={18} /> Pull requests</h2></header>
      <p className="empty">This project is not on GitHub, so its work exists only on this machine. Run <code>/software-factory:git</code> in Claude Code and Rafi will set up a private repository with you.</p>
    </article>
  );
  const rows = vcs.branches;
  const ready = rows.filter((b) => !b.pr || b.pr.state === "CLOSED"), open = rows.filter((b) => b.pr?.state === "OPEN"), merged = rows.filter((b) => b.pr?.state === "MERGED");
  const mergeable = open.filter((b) => b.pr!.mergeable && b.pr!.checks !== "failing"); // the ones the Merge button would accept
  const name = (b: { id: string; revert?: boolean }) => `${b.revert ? "Revert " : ""}${b.id}: ${title(b.id)}`;
  const branch = (id: string) => <span className="branch-pill"><Icon name="branch" />factory/{id}</span>;
  return (
    <article className="tile github" aria-label="Pull requests">
      <header>
        <h2><Icon name="pr" size={18} /> Pull requests</h2>
        <div className="row gap-s">
          <label className="switch" title="When you approve a task, push it and open its pull request at once. The secret scan still runs first, and a push that fails never undoes the approval.">
            <input type="checkbox" role="switch" checked={!!vcs.autoPush} disabled={busy !== "" || !vcs.ghReady} onChange={(e) => run("autopush", "/api/vcs/auto-push", { on: e.target.checked })} />
            Push on approval
          </label>
          <label className="switch" title={vcs.hasChecks || vcs.autoMerge ? "Merge a pull request as soon as its checks pass, with nobody to approve it" : "Needs checks to wait for: add a GitHub Actions workflow first"}>
            <input type="checkbox" role="switch" checked={vcs.autoMerge} disabled={busy !== "" || (!vcs.hasChecks && !vcs.autoMerge)}
              onChange={(e) => run("auto", "/api/vcs/auto-merge", { on: e.target.checked })} />
            Auto-merge
          </label>
          <button className="small" disabled={busy !== "" || !vcs.ghReady} onClick={() => run("sync", "/api/sync", {})} title="Fetch from GitHub, pull merged work in and tidy finished branches"><Icon name="sync" size={13} /> {busy === "sync" ? "Syncing…" : "Sync"}</button>
        </div>
      </header>
      {vcs.note && <p className="note">{vcs.note}</p>}
      {!vcs.ghReady && <p className="note">The GitHub CLI is not signed in. Run <code>gh auth login</code> in a terminal, then Sync.</p>}
      {!vcs.hasChecks && (
        <p className="note ci-note">No checks yet, so a pull request has nothing to wait for. <button className="small" disabled={busy !== ""} onClick={() => run("ci", "/api/ci", {})}>{busy === "ci" ? "Adding…" : "Add checks (CI)"}</button> writes a GitHub Actions workflow from your gate commands; you review it before it does anything.</p>
      )}
      {rows.length === 0 ? <p className="empty">Nothing is waiting to be pushed or merged.</p> : (
        <div className="prs">
          {ready.length > 0 && (
            <section className="gh-list" aria-label="Ready to push">
              <header>
                <StateIcon kind="local" /> {ready.length} ready to push
                {ready.length > 1 && (asking === "push" ? (
                  <span className="gh-batch"><span>Push these {ready.length} and open {ready.length} pull requests?</span><button className="gh" onClick={() => batch("push", ready.map((b) => b.id))}>Push all {ready.length}</button><button className="small" onClick={() => setAsking("")}>Cancel</button></span>
                ) : (
                  <span className="gh-batch"><button className="gh" disabled={busy !== "" || !vcs.ghReady} onClick={() => setAsking("push")}>{busy === "all-push" ? progress : `Push all ${ready.length}`}</button></span>
                ))}
              </header>
              {ready.map((b) => (
                <div className="gh-row" key={b.id}>
                  <StateIcon kind="local" />
                  <div className="gh-main">
                    <div className="gh-title"><button className="quiet linkish" onClick={() => p.open(b.id)}>{name(b)}</button>{b.revert && <span className="gh-label closed">Revert</span>}</div>
                    <div className="gh-meta">{branch(b.id)} <span>{b.pushed ? "Pushed, no pull request" : "Only on this machine"}</span></div>
                  </div>
                  <div className="gh-actions">
                    <button className="gh" disabled={busy !== "" || !vcs.ghReady} onClick={() => run(b.id, "/api/push", { id: b.id })} title={`Pushes factory/${b.id} to GitHub and opens a pull request`}>{busy === b.id ? "Pushing…" : (b.pushed ? "Open pull request" : "Push and open pull request")}</button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {open.length > 0 && (
            <section className="gh-list" aria-label="Open pull requests">
              <header>
                <StateIcon kind="open" /> {open.length} open
                {!vcs.autoMerge && mergeable.length > 1 && (asking === "merge" ? (
                  <span className="gh-batch"><span>Merge these {mergeable.length} pull requests into {vcs.base}, in this order?</span><button className="gh" onClick={() => batch("merge", mergeable.map((b) => b.id))}>Merge all {mergeable.length}</button><button className="small" onClick={() => setAsking("")}>Cancel</button></span>
                ) : (
                  <span className="gh-batch"><button className="gh" disabled={busy !== ""} onClick={() => setAsking("merge")}>{busy === "all-merge" ? progress : `Merge all ${mergeable.length}`}</button></span>
                ))}
              </header>
              {open.map((b) => (
                <div className="gh-row" key={b.id}>
                  <StateIcon kind="open" />
                  <div className="gh-main">
                    <div className="gh-title"><a href={b.pr!.url} target="_blank" rel="noreferrer">{name(b)}</a>{b.revert && <span className="gh-label closed">Revert</span>}</div>
                    <div className="gh-meta"><span>#{b.pr!.number}</span> {branch(b.id)} <span>into {vcs.base}</span> <button className="quiet linkish" onClick={() => p.open(b.id)}>Open task</button></div>
                    <MergeBox id={b.id} pr={b.pr!} vcs={vcs} busy={busy} run={run} />
                  </div>
                </div>
              ))}
            </section>
          )}
          {merged.length > 0 && (
            <section className="gh-list" aria-label="Merged pull requests">
              <header><StateIcon kind="merged" /> {merged.length} merged</header>
              {merged.map((b) => (
                <div className="gh-row" key={b.id}>
                  <StateIcon kind="merged" />
                  <div className="gh-main">
                    <div className="gh-title"><a href={b.pr!.url} target="_blank" rel="noreferrer">{name(b)}</a><span className="gh-label merged"><Icon name="merge" /> Merged</span></div>
                    <div className="gh-meta"><span>#{b.pr!.number}</span> {branch(b.id)}</div>
                  </div>
                  <div className="gh-actions"><button disabled={busy !== ""} onClick={() => run("sync", "/api/sync", {})}>Tidy up</button></div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </article>
  );
}
