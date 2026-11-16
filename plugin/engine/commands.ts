// The commands a conversation's message box offers when a slash is typed.
//
// Nothing here is a hand-written list per kind of agent. There are two sources:
// - the dashboard's own commands (/compact, /clear), the same whichever agent runs the conversation: the dashboard carries them out
//   in the way that agent supports;
// - what the conversation can run itself: the skills and commands installed in the project, and the commands its plugins bring.
//   The agent reports those at the start of every reply (Claude Code: the `init` line of its stream), so a newly installed skill or
//   plugin shows up by itself. Until a conversation has had a reply, the project's own folders are read instead.
//
// A runner for another agent (Codex, later) has one duty here: hand over the names its session reports, as `reported`.
// The agent's own built-in commands are left out on purpose: most only make sense in a terminal, and the ones that change
// the model, the permissions or the settings belong to the dashboard and `factory.config.json`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type Command = { name: string; hint: string; /** What may follow the name. A command that takes words is completed into the box; one that does not is run. */ args?: string; source: "dashboard" | "skill" | "plugin" };

export const DASHBOARD_COMMANDS: Command[] = [
  { name: "compact", args: "[what to keep]", hint: "Clear conversation history but keep a summary in context. Optional: /compact [what to keep]", source: "dashboard" },
  { name: "clear", hint: "Clear conversation history and free up context", source: "dashboard" },
];

const NAME = /^[a-z0-9][\w.:-]{0,79}$/i;
/** One short line: the first sentence, cut to fit a row. */
const short = (text: string) => { const s = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? ""; return s.length > 110 ? `${s.slice(0, 107)}…` : s; };
/** The few frontmatter fields that matter here. A value may be quoted, or folded over indented lines. */
function front(md: string): Record<string, string> {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "", out: Record<string, string> = {};
  for (const m of block.matchAll(/^([\w-]+):[ \t]*(?:[>|][+-]?[ \t]*)?((?:.*)(?:\r?\n[ \t]+.*)*)/gm)) out[m[1]!.toLowerCase()] = m[2]!.replace(/\r?\n[ \t]+/g, " ").trim().replace(/^(["'])(.*)\1$/, "$2");
  return out;
}

/** The skills and commands installed in the project: `.claude/skills/<name>/SKILL.md` and `.claude/commands/**.md`. One a person cannot call is left out. */
export function projectCommands(root: string): Command[] {
  const out: Command[] = [];
  const add = (name: string, file: string) => {
    let f: Record<string, string>;
    try { f = front(readFileSync(file, "utf8").slice(0, 8000)); } catch { return; }
    const n = f.name && NAME.test(f.name) ? f.name : name;
    if (!NAME.test(n) || f["user-invocable"] === "false" || out.some((c) => c.name === n)) return;
    out.push({ name: n, hint: short(f.description ?? "") || "A skill installed in this project", ...(f["argument-hint"] && { args: f["argument-hint"].slice(0, 60) }), source: "skill" });
  };
  const skills = join(root, ".claude", "skills");
  if (existsSync(skills)) for (const d of readdirSync(skills).sort()) if (existsSync(join(skills, d, "SKILL.md"))) add(d, join(skills, d, "SKILL.md"));
  const walk = (dir: string, prefix: string) => {
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, `${prefix}${e}:`);
      else if (e.endsWith(".md")) add(`${prefix}${e.slice(0, -3)}`, p);
    }
  };
  if (existsSync(join(root, ".claude", "commands"))) walk(join(root, ".claude", "commands"), "");
  return out;
}

/** The names a Claude Code session reports it can run, from the `init` line of its stream. Checked: they are shown and typed back. */
export const reportedBy = (init: { slash_commands?: unknown } | undefined): string[] | undefined =>
  Array.isArray(init?.slash_commands) ? [...new Set(init.slash_commands.filter((n): n is string => typeof n === "string" && NAME.test(n)))].slice(0, 400) : undefined;

/**
 * What to offer in one conversation: the dashboard's commands, then the project's skills and commands, then what plugins bring.
 * `reported` is what the conversation's agent last said it can run; once there is one, a skill it does not report is left out
 * (it would not run), and plugin commands (named `plugin:command`) are taken from it.
 */
export function commandsFor(root: string, reported?: string[]): Command[] {
  const taken = new Set(DASHBOARD_COMMANDS.map((c) => c.name));
  const mine = projectCommands(root).filter((c) => !taken.has(c.name) && (!reported || reported.includes(c.name)));
  for (const c of mine) taken.add(c.name);
  const plugins = (reported ?? []).filter((n) => n.includes(":") && !taken.has(n)).sort().map((n): Command => ({ name: n, hint: `From the ${n.split(":")[0]} plugin`, source: "plugin" }));
  return [...DASHBOARD_COMMANDS, ...mine, ...plugins];
}
