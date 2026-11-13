// Shared pieces: the dropdown that replaces the browser's own menu, and skeleton placeholders for loading.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Option = { value: string; label: string; hint?: string; leading?: React.ReactNode; divider?: boolean; disabled?: boolean };

/**
 * A listbox in a glass popover. It opens in a portal, so a table or a scrolling panel never clips it, and flips upward near the
 * bottom of the window. Keys: arrows, Home and End move; Enter or Space choose; Escape closes and returns to the button.
 */
export function Select(p: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  prefix?: string; placeholder?: string; align?: "left" | "right"; disabled?: boolean; small?: boolean; minWidth?: number; block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<React.CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = p.options.findIndex((o) => o.value === p.value);
  const enabled = (i: number) => !p.options[i]?.disabled;

  // Where the list sits: under the button, or above it near the bottom of the window. Recomputed when the page scrolls or resizes.
  const place = () => {
    if (!button.current) return;
    const r = button.current.getBoundingClientRect();
    const width = Math.max(r.width, p.minWidth ?? 240);
    const room = innerHeight - r.bottom, tall = Math.min(340, p.options.length * 56 + 16);
    const up = room < tall && r.top > room;
    const left = p.align === "right" ? Math.max(8, r.right - width) : Math.min(r.left, innerWidth - width - 8);
    setBox({ position: "fixed", left, width, ...(up ? { bottom: innerHeight - r.top + 8 } : { top: r.bottom + 8 }), maxHeight: Math.max(160, (up ? r.top : room) - 24) });
  };
  const show = () => {
    place();
    setActive(current >= 0 ? current : Math.max(0, p.options.findIndex((_, i) => enabled(i))));
    setOpen(true);
  };
  const close = (refocus = false) => { setOpen(false); if (refocus) button.current?.focus(); };
  const choose = (i: number) => { if (!enabled(i)) return; p.onChange(p.options[i]!.value); close(true); };

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(); };
    const follow = (e: Event) => { if (!list.current?.contains(e.target as Node)) place(); };
    addEventListener("pointerdown", away); addEventListener("scroll", follow, true); addEventListener("resize", place);
    return () => { removeEventListener("pointerdown", away); removeEventListener("scroll", follow, true); removeEventListener("resize", place); };
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[id="${id}-${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < p.options.length; i += dir) if (enabled(i)) return i;
    return from;
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setActive(step(p.options.length, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close();
  };

  const shown = p.options[current];
  return (
    <>
      <button
        ref={button} type="button" className={`trigger${p.small ? " small" : ""}${p.block ? " block" : ""}`} disabled={p.disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={`${p.label}: ${shown?.label ?? p.placeholder ?? "none"}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } }}
      >
        {p.prefix && <span className="muted">{p.prefix}</span>}
        {shown?.leading}
        <span className="value">{shown?.label ?? p.placeholder ?? "Choose…"}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div ref={list} className="pop" role="listbox" tabIndex={-1} style={box} aria-label={p.label} aria-activedescendant={`${id}-${active}`} onKeyDown={onKey}>
          {p.options.map((o, i) => (
            <div key={o.value + i}>
              {o.divider && <hr />}
              <div
                id={`${id}-${i}`} role="option" aria-selected={i === current} aria-disabled={o.disabled || undefined}
                className={`opt${i === active ? " active" : ""}${o.disabled ? " off" : ""}`} onPointerEnter={() => enabled(i) && setActive(i)} onClick={() => choose(i)}
              >
                {o.leading}
                <span className="text"><span className="name">{o.label}</span>{o.hint && <span className="hint">{o.hint}</span>}</span>
                {i === current && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A shimmering placeholder. Decorative: the page announces loading once, in words. */
export const Skel = ({ w = "100%", h = 14, r = 8, round = false }: { w?: number | string; h?: number; r?: number; round?: boolean }) =>
  <span className="sk" aria-hidden="true" style={{ width: w, height: h, borderRadius: round ? "50%" : r }} />;

/** What a view looks like before its data arrives. The same grid as the real view, so nothing jumps when it fills in. */
export function ViewSkeleton({ kind }: { kind: "overview" | "board" | "list" | "team" }) {
  const card = (n: number) => Array.from({ length: n }, (_, i) => i);
  if (kind === "overview") return (
    <div className="bento sk-view" aria-busy="true">
      <article className="tile attention"><div className="row gap"><Skel w={52} h={52} round /><div className="grow col"><Skel w="40%" h={16} /><Skel w="60%" h={12} /></div></div></article>
      {card(4).map((i) => <article key={i} className="tile kpi"><Skel w="50%" h={12} /><Skel w="36%" h={32} r={10} /><Skel w="70%" h={11} /></article>)}
      <article className="tile line"><Skel w={90} h={14} /><div className="row gap" style={{ marginTop: 18 }}>{card(5).map((i) => <div key={i} className="col grow"><Skel w={52} h={52} round /><Skel w={70} h={13} /><Skel w={110} h={11} /></div>)}</div></article>
      <article className="tile chart"><Skel w={110} h={14} /><div className="row" style={{ alignItems: "flex-end", gap: 4, height: 120, marginTop: 14 }}>{card(24).map((i) => <span key={i} className="grow row" style={{ alignItems: "flex-end", height: "100%" }}><Skel w="100%" h={20 + ((i * 37) % 90)} r={5} /></span>)}</div></article>
      <article className="tile roster"><Skel w={100} h={14} />{card(3).map((i) => <div key={i} className="row gap" style={{ marginTop: 14 }}><Skel w={34} h={34} round /><div className="grow col"><Skel w="45%" h={13} /><Skel w="70%" h={11} /></div></div>)}</article>
    </div>
  );
  if (kind === "team") return (
    <div className="stack sk-view" aria-busy="true">
      <div className="presets">{card(3).map((i) => <div key={i} className="tile"><Skel w="40%" h={16} /><Skel w="70%" h={12} /></div>)}</div>
      <article className="tile"><div className="row gap">{card(3).map((i) => <div key={i} className="row gap"><Skel w={46} h={46} round /><div className="col"><Skel w={70} h={13} /><Skel w={90} h={11} /></div></div>)}</div></article>
      <div className="roles">{card(4).map((i) => <section key={i} className="role"><div className="row gap"><Skel w={64} h={64} round /><div className="grow col"><Skel w="50%" h={18} /><Skel w="70%" h={12} /></div></div>{card(3).map((j) => <div key={j} className="resp"><Skel w="60%" h={14} /><Skel w="90%" h={11} /></div>)}</section>)}</div>
    </div>
  );
  if (kind === "board") return (
    <div className="board sk-view" aria-busy="true">{card(5).map((i) => <section key={i} className="column"><Skel w="50%" h={14} />{card(i % 3 + 1).map((j) => <div key={j} className="card"><Skel w="30%" h={11} /><Skel w="90%" h={14} /></div>)}</section>)}</div>
  );
  return (
    <div className="stack sk-view" aria-busy="true"><section className="tile">{card(5).map((i) => <div key={i} className="row gap" style={{ padding: "10px 0" }}><Skel w="14%" h={14} /><Skel w="50%" h={14} /><Skel w="20%" h={14} /></div>)}</section></div>
  );
}
