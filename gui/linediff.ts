// A line-by-line difference between two texts, for the Studio: what changed since the last commit, shown in the gutter and in the review step.
export type Op = { kind: "ctx" | "add" | "del"; old?: number; neu?: number; text: string };
export type Row = Op | { kind: "gap"; count: number };

const lines = (t: string) => (t.endsWith("\n") ? t.slice(0, -1) : t).split("\n");

/** Longest-common-subsequence diff. Equal lines at the start and end are skipped first, so the usual small edit is cheap. */
export function lineDiff(before: string, after: string): Op[] {
  const x = lines(before), y = lines(after);
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
  const a = x.slice(head, x.length - tail), b = y.slice(head, y.length - tail);
  const ops: Op[] = [];
  for (let i = 0; i < head; i++) ops.push({ kind: "ctx", old: i + 1, neu: i + 1, text: x[i]! });
  // ponytail: a table of a.length × b.length; past 4 million cells the middle is shown as replaced, which is still correct, only less precise.
  if (a.length * b.length > 4_000_000) {
    a.forEach((t, i) => ops.push({ kind: "del", old: head + i + 1, text: t }));
    b.forEach((t, j) => ops.push({ kind: "add", neu: head + j + 1, text: t }));
  } else {
    const w = b.length + 1, len = new Uint32Array((a.length + 1) * w);
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--) len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1]! + 1 : Math.max(len[(i + 1) * w + j]!, len[i * w + j + 1]!);
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ kind: "ctx", old: head + i + 1, neu: head + j + 1, text: a[i]! }); i++; j++; }
      else if (i < a.length && (j === b.length || len[(i + 1) * w + j]! >= len[i * w + j + 1]!)) { ops.push({ kind: "del", old: head + i + 1, text: a[i]! }); i++; } // removed lines first, as other diffs show them
      else { ops.push({ kind: "add", neu: head + j + 1, text: b[j]! }); j++; }
    }
  }
  for (let k = 0; k < tail; k++) ops.push({ kind: "ctx", old: x.length - tail + k + 1, neu: y.length - tail + k + 1, text: y[y.length - tail + k]! });
  return ops;
}

export const counts = (ops: Op[]) => ({ added: ops.filter((o) => o.kind === "add").length, removed: ops.filter((o) => o.kind === "del").length });

/** Changed lines with `context` unchanged lines around them; longer stretches of unchanged lines become one gap row. */
export function withGaps(ops: Op[], context = 3): Row[] {
  const near = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.kind !== "ctx") for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) near[k] = true; });
  const rows: Row[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (near[i]) { rows.push(ops[i]!); continue; }
    let n = 0;
    while (i < ops.length && !near[i]) { n++; i++; }
    i--;
    rows.push({ kind: "gap", count: n });
  }
  return rows;
}

/** For the editor's gutter, by line number of the new text: green for a new line, blue for one that replaced another, red where lines were removed. */
export function marks(ops: Op[]): Map<number, "add" | "mod" | "del"> {
  const out = new Map<number, "add" | "mod" | "del">();
  for (let i = 0; i < ops.length; ) {
    if (ops[i]!.kind === "ctx") { i++; continue; }
    let removed = 0, k = i;
    const added: number[] = [];
    while (k < ops.length && ops[k]!.kind !== "ctx") { const o = ops[k]!; if (o.kind === "del") removed++; else added.push(o.neu!); k++; }
    added.forEach((n, idx) => out.set(n, idx < removed ? "mod" : "add"));
    if (!added.length && k < ops.length) out.set(ops[k]!.neu!, "del"); // lines vanished just above this one
    i = k;
  }
  return out;
}

export type DiffFile = { path: string; status: "M" | "A" | "D" | "R"; added: number; removed: number; text: string };
/** One git diff (a whole branch against main) cut into its files, each with its own text and counts. */
export function splitDiff(text: string): DiffFile[] {
  const out: DiffFile[] = [];
  let cur: DiffFile | undefined;
  for (const line of text.split("\n")) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) { cur = { path: m[2]!, status: "M", added: 0, removed: 0, text: `${line}\n` }; out.push(cur); continue; }
    if (!cur) continue;
    cur.text += `${line}\n`;
    if (line.startsWith("new file mode")) cur.status = "A";
    else if (line.startsWith("deleted file mode")) cur.status = "D";
    else if (line.startsWith("rename from")) cur.status = "R";
    else if (/^\+(?!\+\+)/.test(line)) cur.added++;
    else if (/^-(?!--)/.test(line)) cur.removed++;
  }
  return out;
}
