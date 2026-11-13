// The team: which responsibilities exist, which role holds each, and the role files built from them.
// A project's team is a preset plus the project's own changes (moves, switched-off responsibilities,
// titles, custom responsibilities), resolved here and checked against the rules every team must obey.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import catalogData from "../templates/catalog.json";
import presetData from "../templates/presets.json";

const DATA = join(import.meta.dir, "..", "templates");

export type Responsibility = {
  id: string; area: string; summary: string; when: string; how: string; access: string[];
  /** Present only once the responsibility is built: a short heading and the instruction an agent receives. */
  title?: string; instruction?: string;
};
export type RoleDef = {
  title: string; description: string; holds: string[];
  defaults?: { model: string; effort: string; fallback: string[] };
};
export type Preset = { title: string; summary: string; roles: Record<string, RoleDef>; scripts: string[]; off: string[]; catalog?: Responsibility[] };

/** A responsibility the user added: a short instruction, when it runs, and the role that holds it. */
export type Custom = {
  id: string; title: string; summary: string; when: "request" | "task"; how: "chat" | "headless";
  access: string[]; instruction: string; role: string;
};
/** What a project changes about its preset. Stored in `factory.config.json` under `team`. */
export type TeamSettings = {
  preset?: string;
  move?: Record<string, string>;
  off?: string[];
  titles?: Record<string, string>;
  custom?: Custom[];
};

// The data files are imported as modules (not read as files) so a watching dev server restarts when they change.
export const catalog = catalogData as Responsibility[];
export const presets = presetData as Record<string, Preset>;
export const DEFAULT_PRESET = "balanced";
export const ROLE_NAME = /^[a-z][a-z0-9-]{1,30}$/;

const titleize = (name: string) => name.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const toResponsibility = (c: Custom): Responsibility => ({ id: c.id, area: "Custom", summary: c.summary, when: c.when, how: c.how, access: c.access, title: c.title, instruction: c.instruction });

const indexes = new WeakMap<object, Map<string, Responsibility>>();
function lookup(team: Preset): Map<string, Responsibility> {
  const cat = team.catalog ?? catalog;
  let index = indexes.get(cat);
  if (!index) { index = new Map(cat.map((r) => [r.id, r])); indexes.set(cat, index); }
  return index;
}

export const isBuilt = (id: string, team: Preset = DEFAULT_TEAM) => !!lookup(team).get(id)?.instruction;
// Unattended responsibilities run as headless agents (a config entry, a role file); conversational ones run in the user's own session.
export const isHeadless = (id: string, team: Preset = DEFAULT_TEAM) => isBuilt(id, team) && lookup(team).get(id)!.how.startsWith("headless");
export const isChat = (id: string, team: Preset = DEFAULT_TEAM) => isBuilt(id, team) && lookup(team).get(id)!.how === "chat";

/** Roles that run unattended: they hold a built headless responsibility, so they have a model setting and a role file. */
export const activeRoles = (team: Preset = DEFAULT_TEAM) =>
  Object.entries(team.roles).filter(([, r]) => r.holds.some((id) => isHeadless(id, team))).map(([name]) => name);

/** Applies a project's changes to its preset. Throws on an unknown preset, responsibility or a script moved to a role. */
export function resolveTeam(s: TeamSettings = {}): Preset {
  const name = s.preset ?? DEFAULT_PRESET;
  const base = presets[name];
  if (!base) throw new Error(`there is no team preset "${name}" (there are: ${Object.keys(presets).join(", ")})`);
  const roles: Record<string, RoleDef> = structuredClone(base.roles);
  const scripts = [...base.scripts];
  const off = [...base.off];
  const custom = s.custom ?? [];
  const cat = [...catalog, ...custom.map(toResponsibility)];
  const known = new Set(cat.map((r) => r.id));
  const role = (n: string): RoleDef => (roles[n] ??= { title: titleize(n), description: "Holds the responsibilities it was given.", holds: [] });

  for (const c of custom) role(c.role).holds.push(c.id);
  for (const [id, to] of Object.entries(s.move ?? {})) {
    if (!known.has(id)) throw new Error(`cannot move ${id}: there is no such responsibility`);
    if (!ROLE_NAME.test(to)) throw new Error(`"${to}" is not a role name (lowercase letters, digits and dashes, at least two characters)`);
    if (scripts.includes(id)) throw new Error(`${id} is a script, not a job for an agent, so it cannot be given to a role`);
    for (const r of Object.values(roles)) r.holds = r.holds.filter((h) => h !== id);
    if (off.includes(id)) off.splice(off.indexOf(id), 1);
    role(to).holds.push(id);
  }
  for (const id of s.off ?? []) {
    if (!known.has(id)) throw new Error(`cannot switch off ${id}: there is no such responsibility`);
    for (const r of Object.values(roles)) r.holds = r.holds.filter((h) => h !== id);
    if (!off.includes(id)) off.push(id);
  }
  for (const [n, title] of Object.entries(s.titles ?? {})) if (roles[n]) roles[n]!.title = title;
  for (const [n, r] of Object.entries(roles)) if (!r.holds.length) delete roles[n]; // a role everything was moved out of is gone

  const team: Preset = { title: base.title, summary: base.summary, roles, scripts, off, catalog: cat };
  // A role that gained unattended work from a move, with no model setting of its own, gets a sensible default.
  for (const r of Object.values(roles)) if (!r.defaults && r.holds.some((id) => isHeadless(id, team))) r.defaults = { model: "sonnet", effort: "medium", fallback: ["haiku"] };
  return team;
}

export const DEFAULT_TEAM: Preset = resolveTeam();

// Responsibilities that may not share a role with the builder's: whoever reviews must not be the author.
const REVIEWING = ["C1", "S1", "S4", "S5", "Q2"];
// The pipeline cannot run without these.
const REQUIRED = ["B1", "B2", "C1"];
// Parts of one pass of work: they run in one stage, so one role holds all of the ones that are switched on.
const TOGETHER = [["B2", "V1"], ["S1", "S5", "Q2"], ["K2", "K4"]];

/** Every rule a team must obey whatever the grouping. Returns the problems found, none if valid. */
export function validateTeam(team: Preset): string[] {
  const errs: string[] = [];
  const seen = new Map<string, string>();
  const index = lookup(team);
  const place = (id: string, where: string) => {
    if (!index.has(id)) errs.push(`${where}: unknown responsibility ${id}`);
    else if (seen.has(id)) errs.push(`${id} is held twice (${seen.get(id)} and ${where})`);
    else seen.set(id, where);
  };
  for (const [name, role] of Object.entries(team.roles)) role.holds.forEach((id) => place(id, name));
  team.scripts.forEach((id) => place(id, "scripts"));
  team.off.forEach((id) => place(id, "off"));
  for (const r of index.values()) if (!seen.has(r.id)) errs.push(`${r.id} is not held by any role and not switched off`);

  for (const id of REQUIRED) if (team.off.includes(id)) errs.push(`${id} cannot be switched off: the pipeline needs it`);
  const builders = Object.entries(team.roles).filter(([, r]) => r.holds.includes("B2")).map(([n]) => n);
  if (builders.length !== 1) errs.push(`exactly one role must hold B2 (the only role that edits source); found ${builders.length}`);
  for (const [name, role] of Object.entries(team.roles))
    if (role.holds.includes("B2") && role.holds.some((id) => REVIEWING.includes(id)))
      errs.push(`${name} holds B2 and also ${role.holds.filter((id) => REVIEWING.includes(id)).join(", ")}: the author cannot review their own work`);
  for (const id of team.scripts) if (index.get(id) && !index.get(id)!.how.startsWith("script")) errs.push(`${id} is not a script responsibility`);
  for (const group of TOGETHER) {
    const holders = new Set(group.map((id) => holderOf(team, id)).filter(Boolean));
    if (holders.size > 1) errs.push(`${group.join(", ")} must be held by one role, because they run as one stage; they are split across ${[...holders].join(" and ")}`);
  }
  return errs;
}

/** Checks the `team` section of a config file for shape. Returns the problems found. */
export function checkSettings(raw: unknown): string[] {
  const errs: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return ["team: must be an object"];
  const s = raw as Record<string, any>;
  const isIds = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string" && /^[A-Z]\d{1,3}$/.test(x));
  if (s.preset !== undefined && (typeof s.preset !== "string" || !presets[s.preset])) errs.push(`team.preset: one of ${Object.keys(presets).join(", ")}`);
  if (s.move !== undefined && (typeof s.move !== "object" || s.move === null || Array.isArray(s.move) || !Object.entries(s.move).every(([k, v]) => /^[A-Z]\d{1,3}$/.test(k) && typeof v === "string" && ROLE_NAME.test(v)))) errs.push("team.move: must map responsibility ids to role names");
  if (s.off !== undefined && !isIds(s.off)) errs.push("team.off: must be a list of responsibility ids");
  if (s.titles !== undefined && (typeof s.titles !== "object" || s.titles === null || !Object.values(s.titles).every((t) => typeof t === "string" && t.trim() !== "" && t.length <= 60))) errs.push("team.titles: must map role names to titles of up to 60 characters");
  if (s.custom !== undefined) {
    if (!Array.isArray(s.custom)) errs.push("team.custom: must be a list");
    else s.custom.forEach((c: any, i: number) => {
      const at = `team.custom[${i}]`;
      if (typeof c !== "object" || c === null) return errs.push(`${at}: must be an object`);
      if (typeof c.id !== "string" || !/^U\d{1,3}$/.test(c.id)) errs.push(`${at}.id: like U1`);
      if (s.custom.findIndex((o: any) => o?.id === c.id) !== i) errs.push(`${at}.id: ${c.id} is used twice`);
      for (const [key, max] of [["title", 80], ["summary", 300], ["instruction", 4000]] as const) if (typeof c[key] !== "string" || !c[key].trim() || c[key].length > max) errs.push(`${at}.${key}: text of up to ${max} characters`);
      if (!["request", "task"].includes(c.when)) errs.push(`${at}.when: request or task`);
      if (!["chat", "headless"].includes(c.how) || (c.how === "headless") !== (c.when === "task")) errs.push(`${at}.how: chat for request, headless for task`);
      if (!Array.isArray(c.access) || !c.access.every((a: unknown) => a === "read" || a === "web")) errs.push(`${at}.access: read and web only: a custom responsibility never edits files`);
      if (typeof c.role !== "string" || !ROLE_NAME.test(c.role)) errs.push(`${at}.role: a role name`);
    });
  }
  return errs;
}

// What each pipeline stage is, as responsibilities: the role that holds them runs the stage.
export const STAGE_DUTIES: Record<string, string[]> = {
  triage: ["P4"], spec: ["B1"], build: ["B2", "V1"], security: ["S1", "S5", "Q2"], review: ["C1"], document: ["K2", "K4"],
};

export const holderOf = (team: Preset, id: string): string | undefined => Object.entries(team.roles).find(([, r]) => r.holds.includes(id))?.[0];

/** The role that runs a pipeline stage: whoever holds its first responsibility that is switched on. */
export function stageRole(team: Preset, stage: string): string | undefined {
  for (const id of STAGE_DUTIES[stage] ?? []) { const holder = holderOf(team, id); if (holder) return holder; }
  return undefined;
}

/** The headings of the parts of a role that a stage covers, so a role that holds several jobs does only this one. */
export const stageDuties = (team: Preset, stage: string, role: string): string[] =>
  (STAGE_DUTIES[stage] ?? []).filter((id) => team.roles[role]?.holds.includes(id) && isHeadless(id, team)).map((id) => lookup(team).get(id)!.title!);

/** Custom unattended responsibilities (`when: task`), grouped by the role that holds them. */
export function customStages(team: Preset): { role: string; titles: string[] }[] {
  return Object.entries(team.roles).flatMap(([role, r]) => {
    const ids = r.holds.filter((id) => lookup(team).get(id)?.area === "Custom" && isHeadless(id, team));
    return ids.length ? [{ role, titles: ids.map((id) => lookup(team).get(id)!.title!) }] : [];
  });
}

const TOOLS: Record<string, string[]> = { read: ["Read", "Grep", "Glob", "Bash"], web: ["WebSearch", "WebFetch"], write: ["Edit", "Write"] };

/** The tools an unattended role needs: the union of what its built headless responsibilities may do. Skill is always allowed. */
export function toolsFor(holds: string[], team: Preset = DEFAULT_TEAM): string[] {
  const access = new Set(holds.filter((id) => isHeadless(id, team)).flatMap((id) => lookup(team).get(id)!.access));
  const tools = ["Read", "Grep", "Glob", "Bash", ...(access.has("web") ? TOOLS.web! : []), ...(access.has("write") ? TOOLS.write! : []), "Skill"];
  return [...new Set(tools)];
}

export const GENERATED = "<!-- Generated from the software factory's responsibility catalog. `factory team apply` rebuilds this file; edits to it are kept unless you pass --force. Remove this line to take it over. -->";

/** A role file: frontmatter plus one section per built responsibility the role holds. */
export function renderRole(name: string, team: Preset = DEFAULT_TEAM, skills: string[] = []): string {
  const role = team.roles[name];
  if (!role) throw new Error(`no role "${name}" in the ${team.title} team`);
  const built = role.holds.filter((id) => isHeadless(id, team)).map((id) => lookup(team).get(id)!);
  if (!built.length) throw new Error(`${name} holds nothing that is built and runs unattended yet`);
  const sections = built.map((r) => `## ${r.title}\n\n${r.instruction}`).join("\n\n");
  const frontmatter = ["---", `name: ${name}`, `description: ${role.description}`, `tools: ${toolsFor(role.holds, team).join(", ")}`,
    ...(skills.length ? ["skills:", ...skills.map((s) => `  - ${s}`)] : []), "---"];
  return `${frontmatter.join("\n")}\n${GENERATED}\nYou are the ${role.title} of this project's software factory.\n\n${sections}\n`;
}

const CHAT_RULES = readFileSync(join(DATA, "CHAT.md"), "utf8").trim();

const chatBody = (team: Preset, ids: string[]) => {
  const chosen = ids.map((id) => lookup(team).get(id)!);
  const steps = chosen.map((r, i) => `## ${chosen.length > 1 ? `Step ${i + 1}: ` : ""}${r.title}\n\n${r.instruction}`).join("\n\n");
  return `# How to work with the user\n\n${CHAT_RULES}\n\n# Your task\n\n${chosen.length > 1 ? "Work through these steps in order, finishing and getting approval for each before the next.\n\n" : ""}${steps}\n`;
};

/**
 * The instructions for a conversation with the user, in their own session: the shared chat
 * rules, then one numbered step per built chat responsibility the role holds. `only` limits it
 * to some responsibilities (each command covers part of a role's job).
 */
export function chatPrompt(name: string, only: string[] = [], team: Preset = DEFAULT_TEAM): string {
  const role = team.roles[name];
  if (!role) throw new Error(`no role "${name}" in the ${team.title} team`);
  for (const id of only) if (!role.holds.includes(id)) throw new Error(`${name} does not hold ${id}`);
  const ids = role.holds.filter((id) => isChat(id, team) && (!only.length || only.includes(id)));
  if (!ids.length) throw new Error(`${name} has no conversational responsibilities that are built yet`);
  return `You are the ${role.title} of this project's software factory. ${role.description}\n\n${chatBody(team, ids)}`;
}

/**
 * The same, named by responsibility instead of role, in the order given. The commands use this, so
 * they keep working however the user grouped the team: if the jobs now sit with several roles, the
 * conversation is held by all of them.
 */
export function chatPromptFor(ids: string[], team: Preset = DEFAULT_TEAM): string {
  const holders: string[] = [];
  for (const id of ids) {
    if (!lookup(team).has(id)) throw new Error(`there is no responsibility ${id}`);
    const holder = holderOf(team, id);
    if (!holder) throw new Error(`${id} is switched off in this team (switch it on with: factory team on ${id})`);
    if (!isChat(id, team)) throw new Error(`${id} is not a conversation`);
    if (!holders.includes(holder)) holders.push(holder);
  }
  const titles = holders.map((h) => team.roles[h]!.title);
  const who = titles.length > 1 ? `${titles.slice(0, -1).join(", ")} and the ${titles.at(-1)}` : titles[0];
  return `You are the ${who} of this project's software factory. ${holders.map((h) => team.roles[h]!.description).join(" ")}\n\n${chatBody(team, ids)}`;
}

/** The agents a normal task uses, and the ones that join only sometimes. */
export function perTask(team: Preset = DEFAULT_TEAM) {
  const always = new Set(["B1", "B2", "C1"].map((id) => holderOf(team, id)!));
  const sometimes: string[] = [];
  const p4 = holderOf(team, "P4"), s1 = holderOf(team, "S1"), k2 = holderOf(team, "K2");
  if (p4) sometimes.push(`${team.roles[p4]!.title} triages ad-hoc items`);
  if (s1) sometimes.push(`${team.roles[s1]!.title} reviews security and performance when a change touches a sensitive area`);
  if (k2) sometimes.push(`${team.roles[k2]!.title} writes a summary when a task is approved`);
  for (const { role } of customStages(team)) sometimes.push(`${team.roles[role]!.title} runs your own check on every task`);
  return { always: always.size, sometimes };
}

/** What `factory team` shows: each role, its responsibilities, what is built, and the task cost. */
export function describeTeam(team: Preset = DEFAULT_TEAM) {
  return Object.entries(team.roles).map(([name, role]) => ({
    name, title: role.title, active: role.holds.some((id) => isBuilt(id, team)),
    built: role.holds.filter((id) => isBuilt(id, team)), planned: role.holds.filter((id) => !isBuilt(id, team)),
    // "chat": a conversation in your session; "agent": an unattended stage with a model setting.
    modes: [...(role.holds.some((id) => isChat(id, team)) ? ["chat"] : []), ...(role.holds.some((id) => isHeadless(id, team)) ? ["agent"] : [])],
  }));
}

/** Moves everything one role holds into another, so the first role disappears. */
export function mergeRoles(s: TeamSettings, from: string, into: string): TeamSettings {
  const team = resolveTeam(s);
  if (!team.roles[from]) throw new Error(`there is no role "${from}" (the roles are: ${Object.keys(team.roles).join(", ")})`);
  if (from === into) throw new Error("a role cannot be merged into itself");
  if (!ROLE_NAME.test(into)) throw new Error(`"${into}" is not a role name`);
  return { ...s, move: { ...s.move, ...Object.fromEntries(team.roles[from]!.holds.map((id) => [id, into])) } };
}

// Roles that are folded into another, in the order that costs least: related jobs go together, and the
// roles closest to the code come last. Used to reach a team size the presets do not have.
const MERGES: [string, string][] = [
  ["operations-engineer", "release-engineer"], ["researcher", "product-partner"], ["designer", "tester"], ["tester", "reviewer"],
  ["security-performance", "reviewer"], ["planner", "product-partner"], ["scribe", "release-engineer"],
  ["release-engineer", "architect"], ["product-partner", "architect"],
];

/**
 * The closest valid grouping with `n` agents: the preset that has exactly that many, else the next
 * larger preset with roles folded together. Keeps the project's custom responsibilities and titles.
 */
export function teamForAgents(n: number, keep: TeamSettings = {}): TeamSettings {
  const sizes = Object.entries(presets).map(([name, p]) => [name, Object.keys(p.roles).length] as const);
  const most = Math.max(...sizes.map(([, c]) => c));
  if (!Number.isInteger(n) || n < 3 || n > most) throw new Error(`a team can have 3 to ${most} agents`);
  const start = sizes.find(([, c]) => c === n) ?? sizes.filter(([, c]) => c > n).sort((a, b) => a[1] - b[1])[0]!;
  let s: TeamSettings = { preset: start[0], ...(keep.custom && { custom: keep.custom }), ...(keep.titles && { titles: keep.titles }) };
  let count = start[1];
  for (const [from, into] of MERGES) {
    if (count === n) break;
    const team = resolveTeam(s);
    if (!team.roles[from] || !team.roles[into]) continue;
    const next = mergeRoles(s, from, into);
    if (validateTeam(resolveTeam(next)).length) continue;
    s = next; count--;
  }
  if (count !== n) throw new Error(`there is no valid grouping with ${n} agents`);
  return s;
}
