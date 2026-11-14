// The command palette (⌘K or Ctrl+K): find anything and run anything from one box. It carries the factory's own checks, so they need no
// page of their own: a check runs here, and Bix can explain what it said. Checks and the palette itself never call a model.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call } from "./data";
import { Icon } from "./icons";
import { Robot } from "./robots";
import { sendChat, type Chats } from "./talk";

export type Check = { name: string; title: string; about: string; writes?: boolean };
export const CHECKS: Check[] = [
  { name: "doctor", title: "Is the setup right?", about: "Checks the config, role files, rules and skills, and lists anything missing." },
  { name: "scan", title: "Any secrets in the files?", about: "Looks for passwords and keys in what git tracks. Values are never printed." },
  { name: "release-check", title: "Is it ready to release?", about: "Blockers and warnings before you release. It never deploys or pushes." },
  { name: "release-info", title: "What would a release contain?", about: "The last tag, the changes since, and every file that carries the version." },
  { name: "status", title: "Where is everything?", about: "The same summary as the command line: each task and the stage it has reached." },
  { name: "team-apply", title: "Rebuild the role files", about: "Regenerates the role files from the team and commits them. Your own edits are kept.", writes: true },
];
/** What each check said last, so the list can show "passed 2m ago". Kept for the life of the page. */
const lastRun = new Map<string, { ok: boolean; at: number }>();
const since = (t: number) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };

type Row = { id: string; group: "Checks" | "Go to" | "Actions" | "Ask"; label: string; hint?: string; tag?: string; icon: string; keys?: string; run: () => void };
type Open = null | { kind: "check"; check: Check; busy: boolean; ok: boolean; output: string } | { kind: "confirm"; check: Check };

export function Palette(p: { views: readonly string[]; go: (view: string) => void; close: () => void; chats: Chats; setChats: React.Dispatch<React.SetStateAction<Chats>>; talkTo: (key: string) => void; theme: string; toggleTheme: () => void; afterRebuild: () => void }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const chat = p.chats.guide ?? { messages: [], busy: false };
  useEffect(() => { const before = document.activeElement as HTMLElement | null; input.current?.focus(); return () => before?.focus?.(); }, []);
  useEffect(() => setSel(0), [query, open]);
  // Keys must keep reaching the dialog when the list is replaced by a result: focus the box then, the search field again on the way back.
  useEffect(() => { if (open) (box.current?.querySelector<HTMLElement>("[data-first]") ?? box.current)?.focus(); else input.current?.focus(); }, [open === null]);

  const run = async (check: Check) => {
    setOpen({ kind: "check", check, busy: true, ok: true, output: "" });
    const r = await call<{ ok: boolean; output: string }>("/api/command", { name: check.name });
    // A check that finds problems exits non-zero; its output is still the answer, so it is shown, not treated as a failure of the page.
    const done = r.ok ? { ok: r.data.ok, output: r.data.output } : { ok: false, output: r.error };
    lastRun.set(check.name, { ok: done.ok, at: Date.now() });
    setOpen({ kind: "check", check, busy: false, ...done });
    if (check.writes && done.ok) p.afterRebuild();
  };
  const ask = (message: string, shown?: string) => {
    if (chat.busy) return;
    sendChat({ key: "guide", message, shown, chat, suggest: false, model: "haiku", effort: "low", setChats: p.setChats });
  };

  const rows: Row[] = useMemo(() => {
    const list: Row[] = CHECKS.filter((c) => !c.writes).map((c) => {
      const l = lastRun.get(c.name);
      return { id: c.name, group: "Checks", label: c.title, hint: l ? `${l.ok ? "✓ passed" : "! found problems"} ${since(l.at)}` : c.name === "status" ? "status of every task" : "not run yet", icon: "check", keys: `${c.name} check ${c.about}`, run: () => run(c) };
    });
    const rebuild = CHECKS.find((c) => c.writes)!;
    list.push({ id: "rebuild", group: "Actions", label: rebuild.title, tag: "changes files", hint: "asks first", icon: "sync", keys: "role files team apply regenerate", run: () => setOpen({ kind: "confirm", check: rebuild }) });
    list.push({ id: "add", group: "Actions", label: "Add an item to the backlog…", icon: "plus", keys: "new task backlog idea", run: () => { p.close(); p.go("Backlog"); setTimeout(() => window.dispatchEvent(new Event("sf:add")), 50); } });
    list.push({ id: "theme", group: "Actions", label: `Switch to the ${p.theme === "dark" ? "light" : "dark"} theme`, icon: p.theme === "dark" ? "sun" : "moon", keys: "dark light mode", run: () => { p.toggleTheme(); p.close(); } });
    for (const v of p.views) list.push({ id: `go-${v}`, group: "Go to", label: `Go to ${v}`, icon: v.toLowerCase(), keys: v, run: () => { p.close(); p.go(v); } });
    return list;
  }, [p.views, p.theme, open]);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || `${r.label} ${r.keys ?? ""}`.toLowerCase().includes(q));
  const asking: Row[] = q.length >= 3 ? [{ id: "ask", group: "Ask", label: `Ask Bix: “${query.trim()}”`, hint: "a few tenths of a cent", icon: "talk", run: () => { ask(query.trim()); p.close(); p.talkTo("guide"); } }] : [];
  const list = [...shown, ...asking];
  const groups = (["Checks", "Go to", "Actions", "Ask"] as const).map((g) => [g, list.filter((r) => r.group === g)] as const).filter(([, r]) => r.length);

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); open ? setOpen(null) : p.close(); return; }
    if (e.key === "Tab") { const f = [...box.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input")]; const a = f[0]!, z = f.at(-1)!; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } return; }
    if (open) { if (e.key === "Enter" && open.kind === "check" && !open.busy && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); run(open.check); } return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, Math.min(list.length - 1, s + (e.key === "ArrowDown" ? 1 : -1)))); }
    else if (e.key === "Enter") { e.preventDefault(); list[sel]?.run(); }
  };
  useEffect(() => { box.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const reply = [...chat.messages].reverse().find((m) => m.who === "team");
  let n = -1;
  return createPortal(
    <div className="pal-overlay" onMouseDown={(e) => e.target === e.currentTarget && p.close()}>
      <div className="pal" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={keys}>
        {open ? (
          <>
            <header className="pal-head">
              <button className="quiet icon" aria-label="Back to the list" onClick={() => setOpen(null)}><Icon name="chevron" size={16} /></button>
              <div className="grow"><b>{open.check.title}</b><div className="note">{open.kind === "confirm" ? "This changes files" : open.busy ? "Running…" : "Ran just now"}{open.kind === "check" && !open.check.writes ? " · nothing was changed" : ""}</div></div>
              {open.kind === "check" && !open.busy && <span className={`pal-state ${open.ok ? "ok" : "warn"}`}>{open.ok ? "✓ Passed" : "! Found problems"}</span>}
            </header>
            {open.kind === "confirm" ? (
              <div className="pal-body">
                <p>{open.check.about}</p>
                <div className="row gap"><button onClick={() => setOpen(null)}>Cancel</button><button className="primary" data-first onClick={() => run(open.check)}>Rebuild the role files</button></div>
              </div>
            ) : (
              <div className="pal-body">
                {open.busy ? <p className="note" role="status">Running…</p> : <pre className="out" aria-label={`Output of ${open.check.title}`}>{open.output || "No output."}</pre>}
                {!open.busy && (
                  <>
                    {(chat.busy || reply) && (
                      <div className="pal-bix" role="log" aria-live="polite">
                        <Robot role="guide" size={32} status={chat.busy ? "working" : "free"} />
                        <div><b>Bix</b> <span className="note">· explains</span><p>{chat.busy ? "Looking…" : reply?.text}</p></div>
                      </div>
                    )}
                    <div className="row gap wrap">
                      <button onClick={() => run(open.check)}>Run again</button>
                      <button className="primary" disabled={chat.busy} onClick={() => ask(`The check "${open.kind === "check" ? open.check.title : ""}" ${open.ok ? "passed" : "found problems"}. Its output:\n${open.output.slice(0, 4000)}\n\nExplain this in plain words and say what, if anything, I should do.`, `Explain “${open.check.title}”`)}>{reply && !chat.busy ? "Ask Bix again" : "Explain with Bix"}</button>
                      <button className="quiet" onClick={() => navigator.clipboard?.writeText(open.output)}>Copy the output</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="pal-search">
              <Icon name="search" size={18} />
              <input ref={input} aria-label="Type a command or search" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={list[sel] ? `pal-${list[sel]!.id}` : undefined} placeholder="Type a command or search…" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} />
              <kbd>esc</kbd>
            </label>
            <div className="pal-list" id="pal-list" role="listbox" aria-label="Results">
              {groups.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
              {groups.map(([g, rs]) => (
                <div key={g} role="group" aria-label={g}>
                  <div className="grp">{g}</div>
                  {rs.map((r) => { n++; const i = n; return (
                    <button key={r.id} id={`pal-${r.id}`} data-i={i} className={`pal-it${sel === i ? " on" : ""}`} role="option" aria-selected={sel === i} tabIndex={-1} onMouseMove={() => setSel(i)} onClick={r.run}>
                      <span className="ic">{r.group === "Ask" ? <Robot role="guide" size={28} /> : <Icon name={r.icon} size={15} />}</span>
                      <span>{r.label}</span>{r.tag && <span className="tag">{r.tag}</span>}{r.hint && <span className={`hint${r.hint.startsWith("✓") ? " ok" : ""}`}>{r.hint}</span>}
                    </button>
                  ); })}
                </div>
              ))}
            </div>
          </>
        )}
        <footer className="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> {open ? "run again" : "run"}</span><span><kbd>esc</kbd> {open ? "back" : "close"}</span><span className="grow" /><span>Open anywhere with <kbd>⌘</kbd> <kbd>K</kbd></span></footer>
      </div>
    </div>,
    document.body,
  );
}
