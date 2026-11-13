// GitHub in the dashboard: what is waiting to be pushed or merged, and the buttons that do it. Each button is the person's approval.
import { useState } from "react";
import type { Item } from "./data";
import { Robot } from "./robots";
import { Skel } from "./ui";

export type VcsPr = { number: number; url: string; state: "OPEN" | "MERGED" | "CLOSED"; checks: "passing" | "failing" | "pending" | "none"; mergeable: boolean };
export type VcsData = {
  remote: string | null; github: boolean; ghReady: boolean; base: string; note?: string; autoMerge: boolean; hasChecks: boolean;
  branches: { id: string; pushed: boolean; pr?: VcsPr }[];
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

const CHECK_TEXT = { passing: "checks passing", failing: "checks failing", pending: "checks running", none: "no checks" };

export function GitHub(p: { vcs: VcsData | null; items: Item[]; act: (path: string, body: unknown) => Promise<boolean>; refresh: () => Promise<void>; open: (id: string) => void }) {
  const [busy, setBusy] = useState("");
  const { vcs } = p;
  const run = async (key: string, path: string, body: unknown) => { setBusy(key); await p.act(path, body); await p.refresh(); setBusy(""); };
  const title = (id: string) => p.items.find((i) => i.id === id)?.title ?? "";

  if (!vcs) return <article className="tile github"><Skel w={120} h={14} /><div style={{ height: 12 }} /><Skel w="70%" h={14} /></article>;
  if (!vcs.remote) return (
    <article className="tile github" aria-label="GitHub">
      <header><h2>GitHub</h2></header>
      <p className="empty">This project is not on GitHub, so its work exists only on this machine. Run <code>/software-factory:git</code> in Claude Code and Rafi will set up a private repository with you.</p>
    </article>
  );
  return (
    <article className="tile github" aria-label="GitHub">
      <header>
        <h2 className="row gap-s"><Robot role="release-engineer" size={28} /> GitHub</h2>
        <div className="row gap-s">
          <label className="switch" title={vcs.hasChecks || vcs.autoMerge ? "Merge a pull request as soon as its checks pass, with nobody to approve it" : "Needs checks to wait for: add a GitHub Actions workflow first"}>
            <input type="checkbox" role="switch" checked={vcs.autoMerge} disabled={busy !== "" || (!vcs.hasChecks && !vcs.autoMerge)}
              onChange={(e) => run("auto", "/api/vcs/auto-merge", { on: e.target.checked })} />
            Auto-merge
          </label>
          <button className="small" disabled={busy !== "" || !vcs.ghReady} onClick={() => run("sync", "/api/sync", {})} title="Fetch from GitHub, pull merged work in and tidy finished branches">{busy === "sync" ? "Syncing…" : "Sync"}</button>
        </div>
      </header>
      {vcs.note && <p className="note">{vcs.note}</p>}
      {!vcs.ghReady && <p className="note">The GitHub CLI is not signed in. Run <code>gh auth login</code> in a terminal, then Sync.</p>}
      {vcs.branches.length === 0 ? <p className="empty">Nothing is waiting to be pushed or merged.</p> : (
        <ul>
          {vcs.branches.map((b) => {
            const pr = b.pr, open = pr?.state === "OPEN";
            return (
              <li key={b.id}>
                <button className="chip-id" onClick={() => p.open(b.id)}>{b.id}</button>
                <span className="what">{title(b.id)}</span>
                {!pr && <span className="badge warn">{b.pushed ? "⚠ Pushed, no pull request" : "Only on this machine"}</span>}
                {open && <span className={`badge ${pr.checks === "failing" || !pr.mergeable ? "bad" : pr.checks === "passing" ? "ok" : "warn"}`}>{pr.mergeable ? `#${pr.number} · ${CHECK_TEXT[pr.checks]}` : `#${pr.number} · conflicts`}</span>}
                {pr?.state === "MERGED" && <span className="badge ok">✓ Merged</span>}
                {open && <a href={pr.url} target="_blank" rel="noreferrer">Open on GitHub</a>}
                {(!pr || !open) && !(pr?.state === "MERGED") && (
                  <button className="primary" disabled={busy !== "" || !vcs.ghReady} onClick={() => run(b.id, "/api/push", { id: b.id })}
                    title={`Pushes factory/${b.id} to GitHub and opens a pull request`}>{busy === b.id ? "Pushing…" : "Push"}</button>
                )}
                {open && (vcs.autoMerge ? <span className="note">Merges when checks pass</span> : (
                  <button className="primary" disabled={busy !== "" || pr.checks === "failing" || !pr.mergeable}
                    onClick={() => confirm(`Merge pull request #${pr.number} into ${vcs.base}?`) && run(b.id, "/api/merge", { id: b.id })}>{busy === b.id ? "Merging…" : "Merge"}</button>
                ))}
                {pr?.state === "MERGED" && <button disabled={busy !== ""} onClick={() => run("sync", "/api/sync", {})}>Tidy up</button>}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
