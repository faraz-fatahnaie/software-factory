// BACKLOG.md is the intake queue. Only the orchestrator writes it; agents never do.
export const SECTIONS = ["Inbox", "Ready", "In progress", "Awaiting approval", "Blocked", "Done"] as const;
export type Section = (typeof SECTIONS)[number];
/** Written into the detail of an item a conversation added: the person worked it out with the team, so autopilot may start it. Items agents suggest do not carry it. */
export const FROM_CONVERSATION = "Added in conversation.";
export type Item = { id: string; prio?: string; title: string; section: string; detail: string };

/** The tasks an item says it needs first: a `Depends on: F-005, F-006` line, as the Planner writes it. Anything that is not an id (none, a name) is ignored. */
export const dependsOn = (i: Pick<Item, "detail">): string[] => [...new Set([...(/^\s*Depends on:\s*(.+)$/im.exec(i.detail)?.[1] ?? "").matchAll(/\bF-\d+\b/g)].map((m) => m[0]))];

const ITEM = /^- \[[ x]\] (F-\d+) (?:\((P\d)\) )?(.+)$/;

export function parse(text: string): Item[] {
  const items: Item[] = [];
  let section = "";
  for (const line of text.split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) { section = h[1]!.trim(); continue; }
    const m = line.match(ITEM);
    if (!m) {
      // Indented lines under an item are its detail (what a person or the planner wrote about it).
      if (items.length && /^\s+\S/.test(line)) { const last = items.at(-1)!; last.detail = last.detail ? `${last.detail}\n${line.trim()}` : line.trim(); }
      continue;
    }
    if (items.some((i) => i.id === m[1])) throw new Error(`BACKLOG.md: duplicate id ${m[1]}`);
    items.push({ id: m[1]!, prio: m[2], title: m[3]!, section, detail: "" });
  }
  return items;
}

/** Index where a new line goes: the end of `section`, before trailing blank lines. */
function endOf(lines: string[], section: Section): number {
  const h = lines.indexOf(`## ${section}`);
  if (h < 0) throw new Error(`BACKLOG.md: missing section "## ${section}"`);
  let e = lines.findIndex((l, i) => i > h && l.startsWith("## "));
  if (e < 0) e = lines.length;
  while (e - 1 > h && lines[e - 1]!.trim() === "") e--;
  return e;
}

/** Moves an item (and its indented detail lines) to the end of another section. `note` is appended to its title. */
export function move(text: string, id: string, to: Section, note = ""): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.match(ITEM)?.[1] === id);
  if (i < 0) throw new Error(`BACKLOG.md: no item ${id}`);
  let j = i + 1;
  while (j < lines.length && /^\s+\S/.test(lines[j]!)) j++;
  const block = lines.splice(i, j - i);
  block[0] = block[0]!.replace(/^- \[[ x]\]/, to === "Done" ? "- [x]" : "- [ ]") + (note && ` (${note})`);
  lines.splice(endOf(lines, to), 0, ...block);
  return lines.join("\n");
}

/**
 * Appends a new item. Titles and details may come from model output, so they are flattened and
 * capped: every detail line is indented, which keeps it from ever being read as an item or a heading.
 */
export function add(text: string, title: string, to: Section = "Inbox", opts: { detail?: string; prio?: string } = {}): { text: string; id: string } {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) throw new Error("backlog item needs a title");
  if (opts.prio !== undefined && !/^P\d$/.test(opts.prio)) throw new Error(`priority must look like P1, got "${opts.prio}"`);
  const detail = (opts.detail ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim().slice(0, 400)).filter(Boolean).slice(0, 40).map((l) => `  ${l}`);
  const max = Math.max(0, ...parse(text).map((i) => Number(i.id.slice(2))));
  const id = `F-${String(max + 1).padStart(3, "0")}`;
  const lines = text.split("\n");
  lines.splice(endOf(lines, to), 0, `- [ ] ${id} ${opts.prio ? `(${opts.prio}) ` : ""}${clean}`, ...detail);
  return { text: lines.join("\n"), id };
}
