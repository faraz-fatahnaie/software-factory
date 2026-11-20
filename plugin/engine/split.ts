// Breaking a large item into smaller ones (F-127): every major change must be built, checked and released in small tasks. Triage already writes a suggested split
// when it finds an item too large (numbered parts, each with a short name and what it covers); this turns that into backlog items, with no model call.
export type Part = { title: string; detail: string };

/** The numbered parts of triage's suggested split, in order: `1. **Name.** what it covers`, with any indented lines that follow. At most 6. */
export function partsOf(triage: string): Part[] {
  const after = triage.split(/suggested split[^\n]*\n/i)[1];
  if (!after) return [];
  const parts: Part[] = [];
  let cur: { title: string; lines: string[] } | undefined;
  for (const raw of after.split("\n")) {
    const m = /^\s*(\d+)\.\s+\*\*(.+?)\*\*\.?\s*(.*)$/.exec(raw);
    if (m) { if (cur) parts.push({ title: cur.title, detail: cur.lines.join(" ").replace(/\s+/g, " ").trim() }); cur = { title: m[2]!.replace(/[.:]$/, "").trim(), lines: m[3] ? [m[3]] : [] }; continue; }
    if (cur && /^\s{2,}\S/.test(raw) && !/^\s*[-*]\s*\*\*/.test(raw)) cur.lines.push(raw.trim());
    else if (cur && /^\s*[-*]\s/.test(raw) && /^\S|^\s{0,1}[-*]/.test(raw)) { parts.push({ title: cur.title, detail: cur.lines.join(" ").replace(/\s+/g, " ").trim() }); cur = undefined; break; } // the next bullet of the note ends the list
    else if (cur && raw.trim() === "") continue;
    else if (cur && !/^\s/.test(raw)) { parts.push({ title: cur.title, detail: cur.lines.join(" ").replace(/\s+/g, " ").trim() }); cur = undefined; break; }
  }
  if (cur) parts.push({ title: cur.title, detail: cur.lines.join(" ").replace(/\s+/g, " ").trim() });
  return parts.filter((p) => p.title).slice(0, 6);
}
