// The commit graph, as VS Code's Source Control Graph and GitHub's network view draw it: one row per commit on every branch,
// coloured lanes with a dot per commit, curves where branches split and join, ref badges, and a details panel for the one you pick.
import { Icon } from "./icons";
import { Robot } from "./robots";

export type Ref = { name: string; kind: "branch" | "remote" | "tag" | "head"; head?: boolean };
export type GraphRow = {
  sha: string; short: string; parents: string[]; date: string; subject: string; refs: Ref[]; kind: string; task?: string; role?: string;
  col: number; converge: number[]; through: number[]; out: number[];
};

const ROW = 40, GAP = 16, PAD = 14;
// Lane colours that read on both themes, in the order VS Code assigns them.
const COLORS = ["#4f8cff", "#a371f7", "#3fb950", "#e3a008", "#2dd4bf", "#f472b6", "#f97316"];
const color = (lane: number) => COLORS[lane % COLORS.length]!;
const x = (lane: number) => PAD + lane * GAP;

/** The lanes and dot of one row. Lines meet at the top and bottom edges, so rows stack into continuous lines. */
function Lanes({ r, lanes, selected }: { r: GraphRow; lanes: number; selected: boolean }) {
  const mid = ROW / 2, cx = x(r.col);
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} C${x1} ${y1 + ROW / 3} ${x2} ${y2 - ROW / 3} ${x2} ${y2}`;
  const merge = r.parents.length > 1, head = r.refs.some((f) => f.head);
  return (
    <svg className="g-lanes" width={PAD * 2 + (lanes - 1) * GAP} height={ROW} aria-hidden="true">
      {r.through.map((l) => <line key={`t${l}`} x1={x(l)} y1={0} x2={x(l)} y2={ROW} stroke={color(l)} strokeWidth={2} />)}
      {r.converge.map((l) => <path key={`c${l}`} d={l === r.col ? `M${cx} 0 V${mid}` : curve(x(l), 0, cx, mid)} stroke={color(l)} strokeWidth={2} fill="none" />)}
      {r.out.map((l, i) => <path key={`o${i}`} d={l === r.col ? `M${cx} ${mid} V${ROW}` : curve(cx, mid, x(l), ROW)} stroke={color(l)} strokeWidth={2} fill="none" />)}
      {merge
        ? <><circle cx={cx} cy={mid} r={6} fill="var(--canvas)" stroke={color(r.col)} strokeWidth={2} /><circle cx={cx} cy={mid} r={2.5} fill={color(r.col)} /></>
        : <circle cx={cx} cy={mid} r={5} fill={color(r.col)} />}
      {(head || selected) && <circle cx={cx} cy={mid} r={9} fill="none" stroke={head ? "var(--accent)" : "var(--muted)"} strokeWidth={2} />}
    </svg>
  );
}

/** "26s", "5m", "3h", "2d": the short form the Git tool windows use in a narrow column. */
export const agoShort = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : s < 2_592_000 ? `${Math.floor(s / 86_400)}d` : `${Math.floor(s / 2_592_000)}mo`;
};

export const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  const [n, unit] = s < 60 ? [s, "second"] : s < 3600 ? [Math.floor(s / 60), "minute"] : s < 86_400 ? [Math.floor(s / 3600), "hour"] : [Math.floor(s / 86_400), "day"];
  return s < 10 ? "just now" : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
};

/** Every commit on every branch, newest first. Pick one with the mouse or the arrow keys; the Source view shows what it changed. */
export function CommitGraph({ rows, lanes, picked, onPick }: { rows: GraphRow[]; lanes: number; picked: string; onPick: (sha: string) => void }) {
  const move = (e: React.KeyboardEvent, delta: number) => {
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, rows.findIndex((r) => r.sha === picked) + delta))];
    if (next) { onPick(next.sha); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sha="${next.sha}"]`)?.focus()); }
  };
  return (
    <ol className="g-list" aria-label="Commits on every branch, newest first" onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}>
      {rows.map((r) => (
        <li key={r.sha}>
          <button className={`g-row${picked === r.sha ? " on" : ""}`} data-sha={r.sha} aria-pressed={picked === r.sha} onClick={() => onPick(r.sha)}>
            <Lanes r={r} lanes={lanes} selected={picked === r.sha} />
            <span className="g-text">
              {r.role && <Robot role={r.role} size={20} />}
              <span className="g-msg" title={r.subject}>{r.subject}</span>
              {r.refs.map((f) => (
                <span key={f.name} className={`ref ${f.kind}${f.head ? " head" : ""}`} title={f.head ? "Where you are now" : f.kind === "remote" ? "On GitHub" : f.kind === "tag" ? "A tag" : "A branch"}>
                  {f.kind === "tag" ? <Icon name="file" size={11} /> : f.kind === "remote" ? <Icon name="sync" size={11} /> : <Icon name="branch" size={11} />}{f.name}
                </span>
              ))}
            </span>
            <time className="g-when" dateTime={r.date} title={r.date}>{agoShort(r.date)}</time>
            <code className="sha">{r.short}</code>
          </button>
        </li>
      ))}
    </ol>
  );
}
