// Breaking a large item into smaller ones (F-127): every major change must be built, checked and released in small tasks. Triage already writes a suggested split
// when it finds an item too large (numbered parts, each with a short name and what it covers); this turns that into backlog items, with no model call.
export type Part = { title: string; detail: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The numbered parts of triage's split, in order: `1. **Name.** what it covers`, with the indented lines that follow. Read from the first line that mentions a
 * split (triage words it "Suggested split" or "Proposed split"); a part's name loses a leading item id ("F-008a, "). Two to six parts, else none.
 */
export function partsOf(triage: string): Part[] {
  const lines = triage.split("\n"), start = lines.findIndex((l) => /\bsplit/i.test(l));
  if (start < 0) return [];
  const parts: { title: string; lines: string[] }[] = [];
  for (const raw of lines.slice(start + 1)) {
    const m = /^\s*(\d+)\.\s+\*\*(.+?)\*\*\.?\s*(.*)$/.exec(raw);
    if (m) { parts.push({ title: m[2]!.replace(/^F-\d+[a-z]?[,:]?\s*/i, "").replace(/[.:]$/, "").trim(), lines: m[3] ? [m[3]] : [] }); continue; }
    const last = parts.at(-1);
    if (last && /^\s{2,}\S/.test(raw) && !/^\s*[-*]\s*\*\*/.test(raw)) last.lines.push(raw.trim());
    else if (last && raw.trim() !== "") break; // the next heading or bullet of the note ends the list
    else if (!last && /^\s*(-\s*)?\*\*\w+\*\*/.test(raw)) break; // another field began before any part
  }
  const out = parts.map((p) => ({ title: p.title, detail: clean(p.lines.join(" ")) })).filter((p) => p.title);
  return out.length >= 2 ? out.slice(0, 6) : [];
}
