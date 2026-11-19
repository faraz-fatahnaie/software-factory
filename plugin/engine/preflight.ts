// A free check before any model is called (F-125): work that is certain to be refused or to repeat other work costs a triage and a spec for nothing.
// Two cases are caught here: an item that only changes the files no agent may edit (the backlog, the rules, the config), and one that asks for what another
// unfinished task already asks. `--anyway` is the person's word to run it regardless.
import type { Item } from "./backlog";
import { pathsIn } from "./supervisor";

const GOVERNANCE = /^(BACKLOG\.md|factory\.config\.json|AGENTS\.md|CLAUDE\.md|\.claude\/|\.factory\/|graphify-out\/|\.git\/)/;
const BOOKKEEPING = /^\s*(close|remove|delete|drop|mark|move|reopen|promote|merge)\b[^.\n]{0,80}\bF-\d+/i;

const words = (i: Item) => new Set(`${i.title} ${i.detail ?? ""}`.toLowerCase().replace(/\bf-\d+\b/g, " ").match(/[a-z0-9]{3,}/g) ?? []);
const similarity = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return a.size + b.size ? n / (a.size + b.size - n) : 0; };

/** Why an item should not start, or "" when it may. `unfinished` is what is already under way or waiting (not landed in main). */
export function preflight(item: Item, unfinished: Item[]): string {
  const text = `${item.title} ${item.detail ?? ""}`;
  const paths = pathsIn(text);
  if (paths.length && paths.every((p) => GOVERNANCE.test(p))) return `${item.id} only changes ${paths.join(", ")}, which no agent may edit. Make that change yourself.`;
  if (!paths.some((p) => !GOVERNANCE.test(p)) && BOOKKEEPING.test(item.title)) return `${item.id} is backlog bookkeeping ("${item.title.slice(0, 70)}"): no agent may edit the backlog, so do it yourself (discard or close the items it names).`;
  const mine = words(item);
  if (mine.size >= 5) for (const other of unfinished) {
    if (other.id === item.id) continue;
    if (similarity(mine, words(other)) >= 0.8) return `${item.id} asks for the same change as ${other.id} (${other.section === "Done" ? "approved, not merged yet" : other.section.toLowerCase()}). Close one of them, or run ${item.id} anyway.`;
  }
  return "";
}
