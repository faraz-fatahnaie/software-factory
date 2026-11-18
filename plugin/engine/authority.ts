// The authority model: who may do what, written as rules that are checked, not as intentions.
//
// What a role can do is the sum of several things that were written at different times by different people: the responsibilities it holds
// (the catalog), the tools in its role file, the skills attached to it, what its conversation is allowed to run, and what the supervisor
// does for it with no model at all. Each is sensible alone; together they can contradict. This file is the one place where they are compared.
//
// The rules (each is a function below, and each has a test):
//   T1  Only the builder edits source: a role whose tools include Edit or Write must hold B2.            (validateTeam, team.ts)
//   T2  The manager starts, retries and guides work, so she cannot also build or judge it.                (validateTeam, team.ts)
//   T3  Nothing unattended may reach outside the project, change governance files or change configuration. (validateTeam, team.ts)
//   G1  Nobody is granted what only a person may do: approve, push, merge, deploy, discard, revert.
//   G2  Only the builder may write code; conversations write documents only; the manager and the guide write nothing.
//   R1  A role file never grants more than the role's responsibilities need (it may grant less: then a capability cannot work).
//   R2  A role file never sets its own permission mode, hooks or MCP servers.
//   S1  A skill attached to a role never widens it: no edits for anyone but the builder, no shell wholesale, nothing only a person may do, no hooks.
//   C1  Everything a conversation is told to run, it is allowed to run, or the gap is written down here with a reason (the ratchet: a new gap fails).
//   M1  The manager's limits agree with each other (a task's limit is not above the day's).
//
// Checked: when the team changes (every path goes through validateTeam), when a skill is installed or attached, when a role or skill file is saved
// in Studio, when the project is checked (`factory doctor`, the health strip), before a task runs, and before the supervisor starts one.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOW as TASK_ALLOW } from "./claude";
import { ALLOW as CHAT_ALLOW, GUIDE_ALLOW, MANAGER_ALLOW, TOPICS } from "./chat";
import { loadConfig, managerOf, projectTeam, type ManagerSettings } from "./config";
import { roleSkills } from "./skills";
import { activeRoles, catalog, holderOf, isBuilt, toolsFor, type Preset } from "./team";

export type Violation = { rule: string; where: string; text: string; /** Written down as a known gap (see KNOWN_GAPS): it does not fail the checks, a new one does. */ known?: boolean };

/** What only a person may do. No allow list, role file, skill or script may grant any of it. */
export const PERSON_ONLY = /\bgit\s+push\b|\bgh\s+pr\b|\bgh\s+release\b|\bfactory\s+(push|merge|approve|discard|revert|reject|deploy|sync)\b|\bfactory\s+release\s+tag\b|\bdeploy\b/i;
const WIDE_SHELL = /^Bash(\(\s*(\*|[a-z]+\s+\*|[a-z]+:\*)?\s*\))?$/;
const EDITS = ["Edit", "Write", "NotebookEdit"];

/** Frontmatter of a markdown file as plain text lines, or "" when there is none. */
const frontOf = (md: string) => md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
const field = (md: string, key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, "im").exec(frontOf(md))?.[1]?.trim();
/** `Read, Grep, Bash` (a role file) or `Bash(factory *) WebSearch` (a skill): the tools named, each with its scope in brackets. */
export const toolTokens = (text: string) => text.match(/[A-Za-z_]+(?:\([^)]*\))?/g) ?? [];
const toolName = (token: string) => token.replace(/\(.*$/, "");

// ---------------------------------------------------------------------------------------------------------------- the floor: what no session may do, whatever a settings file allows

/**
 * Passed as `--disallowedTools` to every session the factory starts (a task stage or a conversation). A deny rule beats any allow rule, from the factory or from the
 * project's own `.claude/settings.json`, which factory sessions read: so a person who allows `Bash(git *)` for the Release Engineer's sake does not also let every agent
 * commit, reset, merge or push. It is checked against what the factory itself allows (a test), and against every command only a person may do (another).
 */
export const DENY_FLOOR: string[] = [
  ...["push", "commit", "reset", "checkout", "switch", "merge", "rebase", "cherry-pick", "revert", "stash", "clean", "restore", "tag", "branch", "worktree", "config", "update-ref", "pull", "am", "apply", "remote", "submodule"].map((c) => `Bash(git ${c}:*)`),
  "Bash(gh:*)",
  ...["approve", "push", "merge", "discard", "revert", "reject", "deploy", "sync", "release tag", "update", "run", "promote"].map((c) => `Bash(factory ${c}:*)`),
];
/** Whether a command is one the floor denies (a prefix match, as the permission system does). */
export const floorDenies = (command: string) => DENY_FLOOR.some((e) => { const p = e.slice(5, -3); return command === p || command.startsWith(`${p} `); });

/** What the project's own `.claude/settings.json` allows every session to do, which is more than the factory's rules assume. Shown, not refused: it is the person's file. */
export function checkProjectSettings(dir: string): Violation[] {
  const out: Violation[] = [];
  let s: any;
  try { s = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")); } catch { return out; }
  const allow: unknown[] = Array.isArray(s?.permissions?.allow) ? s.permissions.allow : [];
  for (const e of allow) {
    if (typeof e !== "string") continue;
    const note = (text: string) => out.push({ rule: "P1", where: ".claude/settings.json", text });
    if (toolName(e) === "Bash" && (WIDE_SHELL.test(e) || /^Bash\(\s*(git|gh)(\s+\*|:\*)\s*\)$/.test(e)))
      note(`the project settings allow "${e}" for every session, agents and conversations alike: that lets any of them change history, branches and files with git. The factory still denies git push, commit, reset, merge, checkout and every gh command to its own sessions, but the rest of what "${e}" allows is open. Prefer the factory's own commands (factory integrate, factory update), which give the Builder the job of resolving a clash`);
    else if (toolName(e) === "Bash" && PERSON_ONLY.test(e)) note(`the project settings allow "${e}", which is something only a person may do (the factory denies it to its own sessions regardless)`);
    if (EDITS.includes(toolName(e)) && !/\((docs\/\*\*|README\.md|CHANGELOG\.md)\)$/.test(e)) note(`the project settings allow "${e}" for every session, so any of them could edit files, which only the builder may`);
  }
  if (["bypassPermissions", "acceptEdits"].includes(s?.permissions?.defaultMode)) out.push({ rule: "P1", where: ".claude/settings.json", text: `the project settings set the permission mode to ${s.permissions.defaultMode}, which is more than the factory's rules assume` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- G1, G2: what conversations and agents are granted

/** The lists of what each kind of session may run, by name, so the rules can read them. */
// A function, not a constant: these modules import each other (skills.ts uses the checks), so the lists are read when asked for, not when the file loads.
export const grants = () => ({ task: TASK_ALLOW, conversation: CHAT_ALLOW, manager: MANAGER_ALLOW, guide: GUIDE_ALLOW });

export function checkGrants(): Violation[] {
  const out: Violation[] = [];
  for (const [who, list] of Object.entries(grants())) {
    for (const entry of list) {
      if (PERSON_ONLY.test(entry)) out.push({ rule: "G1", where: who, text: `${who} sessions are allowed "${entry}", which only a person may do` });
      if (WIDE_SHELL.test(entry)) out.push({ rule: "G1", where: who, text: `${who} sessions are allowed "${entry}", which is the shell wholesale` });
      const edits = EDITS.includes(toolName(entry));
      if (edits && who !== "conversation") out.push({ rule: "G2", where: who, text: `${who} sessions are allowed "${entry}", but only conversations write, and only documents` });
      if (edits && who === "conversation" && !/^(Write|Edit)\((docs\/\*\*|README\.md|CHANGELOG\.md)\)$/.test(entry)) out.push({ rule: "G2", where: who, text: `conversations may write documents only, but are allowed "${entry}"` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- C1: told to run, and allowed to run

/**
 * Gaps between what a conversation is told to run and what it may run, written down with a reason when they are accepted for now. There are none today:
 * a command a conversation may not run is declared as `proposes` on the responsibility (the person runs it, or presses a button). A NEW gap is an error
 * that has to be decided on: grant the command, declare it as proposed, change the instruction, or add it here with a reason.
 */
export const KNOWN_GAPS: Record<string, string> = {};

/** The programs an agent runs through the shell that the permission lists are about: the factory's own command, git, gh and graphify. */
const PROGRAMS = ["factory", "git", "gh", "graphify"];
/**
 * `factory <command>`, `git <command>`... as an instruction names it, one entry per different command: the program and its first word, and a second when it is a plain word
 * (`factory docs save`, `factory team use`, `git describe`), never an argument or an option.
 */
export function commandsNamed(instruction: string): string[] {
  const found = new Set<string>();
  for (const m of instruction.matchAll(new RegExp(`\`(${PROGRAMS.join("|")}) ([^\`]*)\``, "g"))) {
    const words = m[2]!.trim().split(/\s+/);
    if (!/^[a-z][a-z-]*$/.test(words[0] ?? "")) continue;
    // git and graphify take one word (what follows is a branch or an argument); gh and the factory take two (`gh pr merge`, `factory docs save`).
    const two = (m[1] === "gh" || m[1] === "factory") && words[1] && /^[a-z][a-z-]*$/.test(words[1]);
    found.add(`${m[1]} ${words[0]}${two ? ` ${words[1]}` : ""}`);
  }
  return [...found];
}
/** `Bash(factory add:*)` allows `factory add` with any arguments; `Bash(factory team)` allows exactly `factory team` and nothing after it. */
const allowsCommand = (list: string[], command: string) => list.some((e) => {
  if (!e.startsWith("Bash(") || !e.endsWith(")")) return false;
  const body = e.slice(5, -1);
  // `factory add:*` and `factory *` (the form a skill's allowed-tools uses) both allow the command with anything after it.
  const prefix = body.endsWith(":*") ? body.slice(0, -2) : body.endsWith(" *") ? body.slice(0, -2) : undefined;
  return prefix !== undefined ? command === prefix || command.startsWith(`${prefix} `) : command === body;
});

export function checkConversations(team: Preset): Violation[] {
  const found = new Map<string, Violation>();
  for (const [topic, t] of Object.entries(TOPICS)) {
    const allowed = t.guide ? grants().guide : t.manager ? grants().manager : grants().conversation;
    for (const id of t.ids) {
      const r = catalog.find((x) => x.id === id);
      if (!r || !isBuilt(id, team) || !r.instruction) continue;
      const add = (key: string, text: string) => found.set(key, { rule: "C1", where: `${topic} (${id})`, text, known: key in KNOWN_GAPS });
      for (const c of commandsNamed(r.instruction).filter((c) => !allowsCommand(allowed, c) && !(r.proposes ?? []).some((p) => c === p || c.startsWith(`${p} `)))) add(`${id}: ${c}`, `${id} tells the conversation to run \`${c}\`, which it is not allowed to run`);
      // A responsibility that declares access to governance or configuration, but whose conversation can reach neither, cannot do what it declares.
      for (const a of r.access) if (a === "governance" || a === "config") add(`${id}: ${a === "governance" ? "AGENTS.md" : "factory configure"}`, `${id} declares ${a} access, which no conversation has (the guard and the allow list keep it out)`);
    }
  }
  return [...found.values()];
}

/**
 * N1, the other half of C1 for the unattended stages: whatever a stage's instruction tells the agent to run through git, gh, graphify or the factory, the stage may run
 * (`TASK_ALLOW`), or the responsibility declares it as `proposes` (named for someone else to run). A duty with no way to do it is a dead end the agent only finds when it tries.
 */
export function checkStages(team: Preset): Violation[] {
  const out: Violation[] = [];
  for (const r of catalog) {
    if (!r.instruction || !isBuilt(r.id, team) || !r.how.startsWith("headless") || Object.values(TOPICS).some((t) => t.ids.includes(r.id))) continue;
    for (const c of commandsNamed(r.instruction)) if (!allowsCommand(grants().task, c) && !(r.proposes ?? []).some((p) => c === p || c.startsWith(`${p} `))) out.push({ rule: "N1", where: `stage (${r.id})`, text: `${r.id} tells the agent to run \`${c}\`, which a stage is not allowed to run`, known: `${r.id}: ${c}` in KNOWN_GAPS });
  }
  return out;
}

/**
 * N4, the same for the commands a person types (F-106): a terminal skill loads its instructions with `factory role <ids>`, and whatever those tell the agent to
 * run through git, gh, graphify or the factory, the skill's `allowed-tools` must allow, or the responsibility declares it as proposed. In the person's own
 * session a missing permission is only a prompt, so this is shown, never a refusal.
 */
export function checkTerminalSkills(team: Preset, dir = join(import.meta.dir, "..", "skills")): Violation[] {
  const out: Violation[] = [];
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    let md = ""; try { md = readFileSync(join(dir, name, "SKILL.md"), "utf8"); } catch { continue; }
    const allowed = toolTokens(field(md, "allowed-tools") ?? "");
    const ids = [...md.matchAll(/factory role ((?:[A-Z]\d+ ?)+)/g)].flatMap((m) => m[1]!.trim().split(/\s+/));
    for (const id of new Set(ids)) {
      const r = catalog.find((x) => x.id === id);
      if (!r?.instruction || !isBuilt(id, team)) continue;
      for (const c of commandsNamed(r.instruction)) if (!allowsCommand(allowed, c) && !(r.proposes ?? []).some((p) => c === p || c.startsWith(`${p} `)))
        out.push({ rule: "N4", where: `/software-factory:${name} (${id})`, text: `${id} tells the agent to run \`${c}\`, which /software-factory:${name} does not allow, so the person is asked each time`, known: `${name}: ${c}` in KNOWN_GAPS });
    }
  }
  return out;
}

/** What each role may ask for with a button, from the `PROPOSE:` lines its responsibilities' instructions teach: the person presses, and it is done. */
export function proposalsOf(holds: string[]): string[] {
  const kinds = new Set<string>();
  for (const id of holds) for (const m of (catalog.find((r) => r.id === id)?.instruction ?? "").matchAll(/`PROPOSE: ([a-z]+)/g)) kinds.add(m[1]!);
  return [...kinds];
}

// ---------------------------------------------------------------------------------------------------------------- R1, R2: role files

export function checkRoleFile(role: string, md: string, team: Preset): Violation[] {
  const out: Violation[] = [];
  const holds = team.roles[role]?.holds;
  if (!holds) return out;
  const allowed = new Set(toolsFor(holds, team)), given = toolTokens(field(md, "tools") ?? "").map(toolName);
  const extra = given.filter((t) => !allowed.has(t) && t !== "Skill");
  if (extra.length) out.push({ rule: "R1", where: role, text: `${role}'s role file gives it ${extra.join(", ")}, which none of its responsibilities need: that would let it do more than it is meant to` });
  const missing = [...allowed].filter((t) => !given.includes(t));
  if (given.length && missing.length) out.push({ rule: "R1", where: role, text: `${role}'s role file leaves out ${missing.join(", ")}, which its responsibilities need, so some of its work cannot be done`, known: false });
  for (const key of ["permissionMode", "hooks", "mcpServers", "disallowedTools", "tools-allow"]) {
    if (new RegExp(`^${key}:`, "im").test(frontOf(md))) out.push({ rule: "R2", where: role, text: `${role}'s role file sets ${key}: a role cannot change its own permissions, hooks or connections` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- S1: skills

/** What a skill's own settings would add, for one role (or, with no role, for a conversation that has none). Empty when it widens nothing. */
export function checkSkillFile(skill: string, md: string, role: string | undefined, team: Preset): Violation[] {
  const out: Violation[] = [], where = role ? `${skill} on ${role}` : skill;
  const front = frontOf(md);
  const tokens = toolTokens(field(md, "allowed-tools") ?? "");
  const builder = !!role && !!team.roles[role]?.holds.includes("B2");
  const web = !!role && toolsFor(team.roles[role]?.holds ?? [], team).includes("WebFetch");
  for (const t of tokens) {
    if (EDITS.includes(toolName(t)) && !builder) out.push({ rule: "S1", where, text: `the skill ${skill} grants ${t}, so ${role ?? "a conversation"} could edit files, which only the builder may` });
    if (toolName(t) === "Bash" && (PERSON_ONLY.test(t) || WIDE_SHELL.test(t))) out.push({ rule: "S1", where, text: `the skill ${skill} grants ${t}, which ${PERSON_ONLY.test(t) ? "is something only a person may do" : "is the shell wholesale"}` });
    if (["WebFetch", "WebSearch"].includes(toolName(t)) && role && !web) out.push({ rule: "S1", where, text: `the skill ${skill} grants ${t}, but ${role} has no web access` });
  }
  if (/^hooks:/im.test(front)) out.push({ rule: "S1", where, text: `the skill ${skill} brings its own hooks, which would run commands outside the factory's guard` });
  if (/^(permissionMode|mcpServers):/im.test(front)) out.push({ rule: "S1", where, text: `the skill ${skill} sets its own permissions or connections` });
  return out;
}

/** Every attached skill against its role, and every installed skill against a conversation that has no role file to hold it back. */
export function checkSkills(dir: string, team: Preset): Violation[] {
  const out: Violation[] = [];
  const base = join(dir, ".claude", "skills");
  const read = (skill: string) => { try { return readFileSync(join(base, skill, "SKILL.md"), "utf8"); } catch { return ""; } };
  const installed = existsSync(base) ? readdirSync(base).filter((d) => existsSync(join(base, d, "SKILL.md"))) : [];
  const attachedTo = new Map<string, string[]>();
  for (const role of activeRoles(team)) {
    let md = "";
    try { md = readFileSync(join(dir, ".claude", "agents", `${role}.md`), "utf8"); } catch { continue; }
    for (const s of roleSkills(md)) attachedTo.set(s, [...(attachedTo.get(s) ?? []), role]);
  }
  for (const skill of installed) {
    const md = read(skill);
    for (const role of attachedTo.get(skill) ?? []) out.push(...checkSkillFile(skill, md, role, team));
    // Whoever has no role file (the roles that only talk) is offered every skill, so each one is held to what a conversation may do.
    out.push(...checkSkillFile(skill, md, undefined, team).filter((v) => !out.some((o) => o.text === v.text)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- M1: the manager's limits

export function checkLimits(m: Required<ManagerSettings>, gate: string[] = []): Violation[] {
  const out: Violation[] = [];
  if (m.perTask > m.perDay) out.push({ rule: "M1", where: "manager", text: `the limit for one task ($${m.perTask}) is above the day's limit ($${m.perDay}), so the day's limit would never hold` });
  for (const g of gate) if (PERSON_ONLY.test(g)) out.push({ rule: "M1", where: "gate", text: `the gate runs "${g}" after every build, which is something only a person may do` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- everything

export type Authority = { errors: Violation[]; warnings: Violation[]; known: Violation[] };

/** Every rule, for one project. Errors stop work (a task is not started, a skill is not installed); warnings are worth a look; known gaps are listed, not failed. */
export function checkAuthority(dir: string): Authority {
  const errors: Violation[] = [], warnings: Violation[] = [], known: Violation[] = [];
  const put = (v: Violation, soft = false) => (v.known ? known : soft ? warnings : errors).push(v);
  const team = projectTeam(dir);
  for (const v of checkGrants()) put(v);
  for (const v of [...checkConversations(team), ...checkStages(team), ...checkTerminalSkills(team)]) put(v, true); // they are about what the factory itself ships: shown, and failed in the tests, but they do not stop a person's work
  for (const role of activeRoles(team)) {
    let md = "";
    try { md = readFileSync(join(dir, ".claude", "agents", `${role}.md`), "utf8"); } catch { continue; } // a missing file is the setup check's to report
    for (const v of checkRoleFile(role, md, team)) put(v, /leaves out/.test(v.text));
  }
  for (const v of checkProjectSettings(dir)) put(v, true);
  for (const v of checkSkills(dir, team)) put(v, true); // a skill that is already installed is shown, not refused: refusing is for adding one (see skills.ts)
  try { const c = loadConfig(dir); for (const v of checkLimits(managerOf(c), c.gate)) put(v, true); } catch { /* the setup check reports an unreadable config */ }
  const m = (() => { try { return managerOf(loadConfig(dir)); } catch { return undefined; } })();
  if (m && m.parallel * m.perTask > m.perDay) warnings.push({ rule: "M1", where: "manager", text: `${m.parallel} tasks at once at $${m.perTask} each could spend $${m.parallel * m.perTask}, more than the day's limit of $${m.perDay}` });
  return { errors, warnings, known };
}

/** Who may do what in this project, in a line each: the answer to "can this person do that?". */
export function authorityMatrix(dir: string): { role: string; title: string; can: string[]; proposes: string[]; skills: string[]; conversations: string[] }[] {
  const team = projectTeam(dir);
  return Object.entries(team.roles).map(([role, r]) => {
    const tools = new Set(toolsFor(r.holds, team));
    let skills: string[] = [];
    try { skills = roleSkills(readFileSync(join(dir, ".claude", "agents", `${role}.md`), "utf8")); } catch { /* no role file */ }
    const can = [
      ...(r.holds.includes("B2") ? ["edits code in its own task folder"] : tools.size && activeRoles(team).includes(role) ? ["reads the project and runs the checks"] : []),
      ...(tools.has("WebFetch") ? ["searches the web"] : []),
      ...(r.holds.includes("M18") ? ["starts, retries, guides and stops tasks (within the limits), and proposes; never approves, pushes, merges or deploys"] : []),
      ...(r.holds.some((id) => Object.values(TOPICS).some((t) => t.ids.includes(id) && !t.manager && !t.guide)) ? ["writes documents in conversation"] : []),
    ];
    const conversations = Object.entries(TOPICS).filter(([, t]) => t.ids.some((id) => r.holds.includes(id))).map(([k]) => k);
    return { role, title: r.title, can, proposes: proposalsOf(r.holds), skills, conversations };
  });
}
export { holderOf };
