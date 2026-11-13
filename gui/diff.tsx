// What changed, to be read by eye: a folder tree of files with their +/- counts, and a unified diff with line numbers and coloured lines.
// The same pieces serve the working changes and any commit, so a person learns one way of reading a change.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";

export type FileItem = { path: string; status: "M" | "A" | "D" | "R" | "U"; added: number; removed: number };
export const STATUS_TEXT = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", U: "Untracked" } as const;

/** Lines added and removed, as GitHub shows them: the numbers and five squares split in proportion. */
export function Stat({ added, removed }: { added: number; removed: number }) {
  const total = added + removed, green = total ? Math.round((added / total) * 5) : 0;
  return (
    <span className="stat" role="img" aria-label={`${added} lines added, ${removed} removed`}>
      {added > 0 && <b className="add">+{added}</b>}
      {removed > 0 && <b className="del">−{removed}</b>}
      {total === 0 && <span className="note">no lines</span>}
      {total > 0 && <span className="bar" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < green ? "a" : "d"} />)}</span>}
    </span>
  );
}

type Dir = { name: string; path: string; dirs: Map<string, Dir>; files: FileItem[] };
type Line = { kind: "hunk" | "add" | "del" | "ctx" | "note"; old?: number; neu?: number; text: string };

/** Reads a unified diff into lines with their old and new line numbers. Everything before the first hunk (the file header) is dropped. */
export function parseUnified(text: string): { lines: Line[]; binary: boolean } {
  const lines: Line[] = [];
  let o = 0, n = 0, started = false;
  for (const raw of text.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(raw);
    if (hunk) { o = Number(hunk[1]); n = Number(hunk[2]); started = true; lines.push({ kind: "hunk", text: hunk[3] ?? "" }); continue; }
    if (/^Binary files .* differ$/.test(raw)) return { lines: [], binary: true };
    if (!started) continue;
    if (raw.startsWith("+")) lines.push({ kind: "add", neu: n++, text: raw.slice(1) });
    else if (raw.startsWith("-")) lines.push({ kind: "del", old: o++, text: raw.slice(1) });
    else if (raw.startsWith("\\")) lines.push({ kind: "note", text: raw.slice(2) });
    else if (raw.startsWith(" ")) lines.push({ kind: "ctx", old: o++, neu: n++, text: raw.slice(1) });
  }
  return { lines, binary: false };
}

/** The diff of one file, fetched when it is picked. `sha` makes it that commit's change; without it, the working copy's. */
export function FileDiff({ path, sha, status }: { path: string; sha?: string; status?: FileItem["status"] }) {
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    setText(null); setProblem("");
    fetch(`/api/filediff?path=${encodeURIComponent(path)}${sha ? `&sha=${sha}` : ""}`).then(async (r) => (r.ok ? setText(await r.text()) : setProblem((await r.json()).error)));
  }, [path, sha]);
  const parsed = useMemo(() => (text === null ? null : parseUnified(text)), [text]);
  const name = path.split("/").at(-1)!, dir = path.slice(0, path.length - name.length);
  const added = parsed?.lines.filter((l) => l.kind === "add").length ?? 0, removed = parsed?.lines.filter((l) => l.kind === "del").length ?? 0;
  return (
    <section className="diff-view" aria-label={`Changes in ${path}`}>
      <header>
        <span className="path"><span className="dir">{dir}</span><b>{name}</b></span>
        {status && <span className={`status-text ${status}`}>{STATUS_TEXT[status]}</span>}
        {parsed && !parsed.binary && <Stat added={added} removed={removed} />}
      </header>
      {problem ? <p className="error">{problem}</p> : !parsed ? <p className="empty">Loading…</p> : parsed.binary ? <p className="empty">A binary file changed. There is no text to show.</p>
        : parsed.lines.length === 0 ? <p className="empty">No lines changed (a rename or a permission change).</p> : (
          <div className="udiff">
            {parsed.lines.map((l, i) => l.kind === "hunk" ? (
              <div key={i} className="ln hunk"><span className="no" /><span className="no" /><span className="sign" /><code>{l.text ? `… ${l.text}` : "…"}</code></div>
            ) : (
              <div key={i} className={`ln ${l.kind}`}>
                <span className="no" aria-hidden="true">{l.old}</span>
                <span className="no" aria-hidden="true">{l.neu}</span>
                <span className="sign" aria-hidden="true">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</span>
                <code>{l.kind === "add" && <span className="sr">added: </span>}{l.kind === "del" && <span className="sr">removed: </span>}{l.text || " "}</code>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

/** Files grouped by folder, folders with a single child folded into one row ("plugin/engine"), each folder collapsible. Arrow keys move between files. */
export function FileTree({ files, picked, onPick, label }: { files: FileItem[]; picked: string; onPick: (path: string) => void; label: string }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const root = useMemo(() => {
    const top: Dir = { name: "", path: "", dirs: new Map(), files: [] };
    for (const f of files) {
      let d = top;
      const parts = f.path.split("/").slice(0, -1);
      parts.forEach((part, i) => { const path = parts.slice(0, i + 1).join("/"); if (!d.dirs.has(part)) d.dirs.set(part, { name: part, path, dirs: new Map(), files: [] }); d = d.dirs.get(part)!; });
      d.files.push(f);
    }
    return top;
  }, [files]);
  const rows: (({ type: "dir"; depth: number; name: string; path: string; count: number; open: boolean }) | ({ type: "file"; depth: number; file: FileItem }))[] = [];
  const count = (d: Dir): number => d.files.length + [...d.dirs.values()].reduce((s, c) => s + count(c), 0);
  const walk = (d: Dir, depth: number) => {
    for (let child of [...d.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      let name = child.name;
      while (child.files.length === 0 && child.dirs.size === 1) { child = [...child.dirs.values()][0]!; name += `/${child.name}`; } // a folder holding only one folder reads as one row
      const open = !closed.has(child.path);
      rows.push({ type: "dir", depth, name, path: child.path, count: count(child), open });
      if (open) walk(child, depth + 1);
    }
    for (const f of [...d.files].sort((a, b) => a.path.localeCompare(b.path))) rows.push({ type: "file", depth, file: f });
  };
  walk(root, 0);
  const order = rows.flatMap((r) => (r.type === "file" ? [r.file.path] : []));
  const move = (e: React.KeyboardEvent, delta: number) => {
    e.preventDefault();
    const next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(picked) + delta))];
    if (next) { onPick(next); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-file="${CSS.escape(next)}"]`)?.focus()); }
  };
  return (
    <ul className="ftree" role="tree" aria-label={label} onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}>
      {rows.map((r) => r.type === "dir" ? (
        <li key={`d${r.path}`} role="treeitem" aria-expanded={r.open}>
          <button className="frow dir" style={{ paddingLeft: 6 + r.depth * 14 }} onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(r.path)) n.delete(r.path); else n.add(r.path); return n; })}>
            <span className={`chev${r.open ? " open" : ""}`}><Icon name="chevron" size={12} /></span><span className="name">{r.name}</span><span className="count">{r.count}</span>
          </button>
        </li>
      ) : (
        <li key={`f${r.file.path}`} role="treeitem" aria-selected={picked === r.file.path}>
          <button className={`frow file st-${r.file.status}${picked === r.file.path ? " on" : ""}`} data-file={r.file.path} style={{ paddingLeft: 22 + r.depth * 14 }} onClick={() => onPick(r.file.path)} title={`${STATUS_TEXT[r.file.status]}: ${r.file.path}`}>
            <Icon name="file" size={14} /><span className="name">{r.file.path.split("/").at(-1)}</span>
            <Stat added={r.file.added} removed={r.file.removed} />
            <span className={`letter ${r.file.status}`} aria-label={STATUS_TEXT[r.file.status]}>{r.file.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
