// Source, laid out like the Git tool windows of PyCharm and VS Code, so a change can be followed by eye:
// a toolbar with the branch, sync state and the totals; a Changes tab (folder tree on the left, the diff of the picked file on the right);
// and a Log tab (branches, the commit graph, and what the picked commit changed, with its files and their diffs).
import { useEffect, useMemo, useRef, useState } from "react";
import { call, type Item } from "./data";
import { ago, CommitGraph, type GraphRow } from "./commitgraph";
import { FileDiff, FileTree, STATUS_TEXT, Stat, type FileItem } from "./diff";
import { Icon } from "./icons";
import { ViewSkeleton } from "./ui";
import { StateIcon, type VcsData } from "./vcs";

type Lane = { id: string; ahead: number; inProgress: boolean; pushed: boolean; revert: boolean; date: string };
type SourceData = { branch: string; ahead: number | null; behind: number | null; dirty: { count: number; files: FileItem[] }; lanes: Lane[] };
type Detail = { sha: string; parents: string[]; author: string; date: string; message: string; files: FileItem[] };
type Props = { items: Item[]; vcs: VcsData | null; act: (path: string, body: unknown) => Promise<boolean>; refreshVcs: () => Promise<void>; open: (id: string) => void };

/** `https://github.com/owner/repo.git` or `git@github.com:owner/repo.git` as owner/repo. */
const repoOf = (remote: string | null) => /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote ?? "")?.[1];
const sum = (files: FileItem[]) => ({ added: files.reduce((s, f) => s + f.added, 0), removed: files.reduce((s, f) => s + f.removed, 0) });

export function Source(p: Props) {
  const [src, setSrc] = useState<SourceData | null>(null);
  const [tab, setTab] = useState<"changes" | "log" | null>(null);
  const load = () => call<SourceData>("/api/source").then((r) => r.ok && setSrc(r.data));
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, []);
  // Open on what needs reading: the changes when there are any, otherwise the history.
  useEffect(() => { if (src && tab === null) setTab(src.dirty.count > 0 ? "changes" : "log"); }, [src]);

  if (!src || !tab) return <ViewSkeleton kind="list" />;
  const repo = repoOf(p.vcs?.remote ?? null), total = sum(src.dirty.files);
  return (
    <div className="source">
      <div className="scm-bar" role="status" aria-label="Branch status">
        <span className="item"><Icon name="branch" size={15} /> <b>{src.branch}</b></span>
        {src.ahead !== null && <span className="item" title="Commits here that are not on GitHub (they travel in the next pull request), and commits on GitHub that are not here"><Icon name="sync" size={14} /> {src.behind}<Icon name="down" size={13} /> {src.ahead}<Icon name="up" size={13} /></span>}
        {src.dirty.count > 0 && <span className="item">{src.dirty.count} changed file{src.dirty.count === 1 ? "" : "s"} <Stat {...total} /></span>}
        <span className="grow" />
        <span className="legend" aria-label="What the letters mean">{(["M", "A", "D", "U"] as const).map((l) => <span key={l}><b className={`letter ${l}`}>{l}</b> {STATUS_TEXT[l]}</span>)}</span>
        {repo ? <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a> : <span className="note">{p.vcs?.remote ?? "Not on GitHub"}</span>}
      </div>
      <div className="pills" role="tablist" aria-label="Source">
        <button role="tab" aria-selected={tab === "changes"} onClick={() => setTab("changes")}>Changes{src.dirty.count > 0 && <span className="count">{src.dirty.count}</span>}</button>
        <button role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>Log</button>
      </div>
      {tab === "changes" ? <Changes files={src.dirty.files} count={src.dirty.count} toLog={() => setTab("log")} /> : <Log src={src} {...p} />}
    </div>
  );
}

function Changes({ files, count, toLog }: { files: FileItem[]; count: number; toLog: () => void }) {
  const [picked, setPicked] = useState("");
  // Keep a file picked: the first one, and a new one if the picked file is no longer changed.
  useEffect(() => { if (!files.some((f) => f.path === picked)) setPicked(files[0]?.path ?? ""); }, [files]);
  const tracked = files.filter((f) => f.status !== "U"), untracked = files.filter((f) => f.status === "U");
  const file = files.find((f) => f.path === picked);
  if (count === 0) return (
    <section className="tile empty-state">
      <Icon name="check" size={28} />
      <h2>No changes</h2>
      <p className="note">Your files match the last saved commit. See what happened before in the <button className="quiet linkish" onClick={toLog}>Log</button>.</p>
    </section>
  );
  return (
    <div className="scm-split changes-split">
      <aside className="pane" aria-label="Changed files">
        {tracked.length > 0 && (
          <section>
            <h2 className="pane-h">Changes <span className="count">{tracked.length}</span><Stat {...sum(tracked)} /></h2>
            <FileTree files={tracked} picked={picked} onPick={setPicked} label="Changed files" />
          </section>
        )}
        {untracked.length > 0 && (
          <section>
            <h2 className="pane-h" title="Files git does not know yet">Untracked <span className="count">{untracked.length}</span></h2>
            <FileTree files={untracked} picked={picked} onPick={setPicked} label="Untracked files" />
          </section>
        )}
        {count > files.length && <p className="note pad">and {count - files.length} more</p>}
      </aside>
      <main className="pane main" tabIndex={0} aria-label="What changed in the picked file">{file ? <FileDiff path={file.path} status={file.status} /> : <p className="empty">Pick a file to see what changed in it.</p>}</main>
    </div>
  );
}

function Log({ src, items, vcs, act, refreshVcs, open }: { src: SourceData } & Props) {
  const [branch, setBranch] = useState("");
  const [graph, setGraph] = useState<{ rows: GraphRow[]; lanes: number; matches?: number } | null>(null);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState(""); // what is searched: the typed text, once typing pauses
  const box = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  // "/" jumps to the search box, as on GitHub, unless you are typing somewhere.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); box.current?.focus(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (term) params.set("q", term);
    const load = () => call<{ rows: GraphRow[]; lanes: number; matches?: number }>(`/api/graph${params.size ? `?${params}` : ""}`).then((r) => r.ok && setGraph(r.data));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [branch, term]);
  // The newest commit is picked first, as the Git tool windows do.
  useEffect(() => { if (graph && !graph.rows.some((r) => r.sha === picked)) setPicked(graph.rows[0]?.sha ?? ""); }, [graph]);
  useEffect(() => {
    setDetail(null); setFile("");
    if (picked) call<Detail>(`/api/commit?sha=${picked}`).then((r) => { if (r.ok) { setDetail(r.data); setFile(r.data.files[0]?.path ?? ""); } });
  }, [picked]);

  const row = graph?.rows.find((r) => r.sha === picked);
  const title = (id: string) => items.find((i) => i.id === id)?.title ?? "";
  // A task is reverted when a revert commit for it is newer than its merge (the rows are newest first).
  const reverted = useMemo(() => {
    const done = new Set<string>(), seen = new Set<string>();
    for (const r of graph?.rows ?? []) { if (!r.task) continue; if (r.kind === "revert") seen.add(r.task); if (r.kind === "merge" && seen.has(r.task)) done.add(r.task); }
    return done;
  }, [graph]);
  const revert = async (id: string) => {
    if (!confirm(`Revert ${id}? This prepares a change that undoes it. Nothing is pushed or merged until you do that yourself.`)) return;
    setBusy(true);
    await act("/api/revert", { id });
    await refreshVcs();
    setBusy(false);
  };
  const [head, ...rest] = (detail?.message ?? "").split("\n");
  const body = rest.join("\n").trim();
  const chosen = detail?.files.find((f) => f.path === file);

  return (
    <div className="scm-split log-split">
      <aside className="pane branches" aria-label="Branches">
        <h2 className="pane-h">Branches <span className="count">{src.lanes.length + 1}</span></h2>
        <ul>
          <li><button className="brow" aria-pressed={branch === ""} onClick={() => setBranch("")}><Icon name="commit" size={15} /><span className="name">All branches</span></button></li>
          <li><button className="brow" aria-pressed={branch === src.branch} onClick={() => setBranch(src.branch)}><Icon name="branch" size={15} /><span className="branch-pill">{src.branch}</span><span className="default-tag">Default</span></button></li>
          {src.lanes.map((l) => {
            const info = vcs?.branches.find((b) => b.id === l.id)?.pr;
            const state = l.inProgress ? "Being worked on" : info?.state === "OPEN" ? `Pull request #${info.number}` : l.pushed ? "On GitHub" : l.revert ? "A revert, only here" : "Approved, only here";
            return (
              <li key={l.id}>
                <button className="brow" aria-pressed={branch === `factory/${l.id}`} onClick={() => setBranch(`factory/${l.id}`)}>
                  {info?.state === "OPEN" ? <StateIcon kind="open" /> : <Icon name="branch" size={15} />}
                  <span className="branch-pill">factory/{l.id}</span>
                  {l.ahead > 0 && <span className="ahead" title={`${l.ahead} commit${l.ahead === 1 ? "" : "s"} ahead of ${src.branch}`}>+{l.ahead}</span>}
                  <span className="sub">{title(l.id) || l.id} · {state}{l.date ? ` · ${ago(l.date)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="pane graph-pane" aria-label="Commit graph">
        <div className="g-search" role="search">
          <Icon name="search" size={15} />
          <input ref={box} type="search" aria-label="Search commits" placeholder="Search commits: message, author, hash, branch, tag or task  ( / )" value={query} maxLength={100}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setTerm(""); } }} />
          <span className="note" role="status">{term && graph ? `${graph.matches ?? 0} match${graph.matches === 1 ? "" : "es"}${(graph.matches ?? 0) > graph.rows.length ? `, showing ${graph.rows.length}` : ""}` : ""}</span>
        </div>
        {!graph ? <ViewSkeleton kind="list" /> : term && graph.rows.length === 0 ? <p className="empty">No commits match “{term}”.</p>
          : <CommitGraph rows={graph.rows} lanes={graph.lanes} picked={picked} onPick={setPicked} query={term} />}
      </main>

      <section className="pane detail-pane" aria-label="Commit details">
        {!picked ? <p className="empty">Pick a commit to see what it changed.</p> : !detail ? <p className="empty">Loading…</p> : (
          <>
            <header className="d-head">
              <h2>{head}</h2>
              {row?.kind === "merge" && row.task && !reverted.has(row.task) && (
                <button disabled={busy} onClick={() => revert(row.task!)}><Icon name="undo" size={13} /> {busy ? "Reverting…" : `Revert ${row.task}`}</button>
              )}
              {row?.task && reverted.has(row.task) && row.kind === "merge" && <span className="gh-label closed"><Icon name="undo" /> Reverted later</span>}
            </header>
            {body && <pre className="doc">{body}</pre>}
            <p className="d-meta">
              <span>{detail.author}</span><span>{new Date(detail.date).toLocaleString()}</span>
              <code className="sha">{detail.sha.slice(0, 7)}</code>
              {detail.parents.length > 0 && <span>{detail.parents.length > 1 ? "parents" : "parent"} {detail.parents.map((x) => <button key={x} className="sha" onClick={() => setPicked(x)} title="Go to this commit">{x.slice(0, 7)}</button>)}</span>}
              {row?.task && <button className="chip-id" onClick={() => open(row.task!)}>{row.task}</button>}
            </p>
            <h3 className="pane-h">{detail.parents.length > 1 ? "Changes from the merged branch" : "Files"} <span className="count">{detail.files.length}</span><Stat {...sum(detail.files)} /></h3>
            {detail.files.length === 0 ? <p className="empty">No file changes.</p> : <FileTree files={detail.files} picked={file} onPick={setFile} label="Files in this commit" />}
            {chosen && <FileDiff path={chosen.path} sha={detail.sha} status={chosen.status} />}
          </>
        )}
      </section>
    </div>
  );
}
