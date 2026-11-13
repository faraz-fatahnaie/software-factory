// The team: which responsibilities exist, which role holds each, and the role files built from them.
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
export type Preset = { title: string; summary: string; roles: Record<string, RoleDef>; scripts: string[]; off: string[] };

const load = <T>(file: string): T => JSON.parse(readFileSync(join(DATA, file), "utf8"));
export const catalog = load<Responsibility[]>("catalog.json");
export const presets = load<Record<string, Preset>>("presets.json");
export const DEFAULT_PRESET = "balanced";

const byId = new Map(catalog.map((r) => [r.id, r]));
export const isBuilt = (id: string) => !!byId.get(id)?.instruction;
// Unattended responsibilities run as headless agents (a config entry, a role file); conversational ones run in the user's own session.
export const isHeadless = (id: string) => isBuilt(id) && byId.get(id)!.how.startsWith("headless");
export const isChat = (id: string) => isBuilt(id) && byId.get(id)!.how === "chat";

/** Roles that run unattended today: they hold a built headless responsibility, so they have a model setting and a role file. */
export const activeRoles = (preset: Preset = presets[DEFAULT_PRESET]!) =>
  Object.entries(preset.roles).filter(([, r]) => r.holds.some(isHeadless)).map(([name]) => name);

// Responsibilities that may not share a role with the builder's: whoever reviews must not be the author.
const REVIEWING = ["C1", "S1", "S4", "S5", "Q2"];

/** Every rule a team must obey whatever the grouping. Returns the problems found, none if valid. */
export function validateTeam(preset: Preset, cat: Responsibility[] = catalog): string[] {
  const errs: string[] = [];
  const seen = new Map<string, string>();
  const place = (id: string, where: string) => {
    if (!cat.some((r) => r.id === id)) errs.push(`${where}: unknown responsibility ${id}`);
    else if (seen.has(id)) errs.push(`${id} is held twice (${seen.get(id)} and ${where})`);
    else seen.set(id, where);
  };
  for (const [name, role] of Object.entries(preset.roles)) role.holds.forEach((id) => place(id, name));
  preset.scripts.forEach((id) => place(id, "scripts"));
  preset.off.forEach((id) => place(id, "off"));
  for (const r of cat) if (!seen.has(r.id)) errs.push(`${r.id} is not held by any role and not switched off`);

  const builders = Object.entries(preset.roles).filter(([, r]) => r.holds.includes("B2")).map(([n]) => n);
  if (builders.length !== 1) errs.push(`exactly one role must hold B2 (the only role that edits source); found ${builders.length}`);
  for (const [name, role] of Object.entries(preset.roles))
    if (role.holds.includes("B2") && role.holds.some((id) => REVIEWING.includes(id)))
      errs.push(`${name} holds B2 and also ${role.holds.filter((id) => REVIEWING.includes(id)).join(", ")}: the author cannot review their own work`);
  for (const id of preset.scripts) if (byId.get(id) && !byId.get(id)!.how.startsWith("script")) errs.push(`${id} is not a script responsibility`);
  return errs;
}

const TOOLS: Record<string, string[]> = { read: ["Read", "Grep", "Glob", "Bash"], web: ["WebSearch", "WebFetch"], write: ["Edit", "Write"] };

/** The tools an unattended role needs: the union of what its built headless responsibilities may do. Skill is always allowed. */
export function toolsFor(holds: string[]): string[] {
  const access = new Set(holds.filter(isHeadless).flatMap((id) => byId.get(id)!.access));
  const tools = ["Read", "Grep", "Glob", "Bash", ...(access.has("web") ? TOOLS.web! : []), ...(access.has("write") ? TOOLS.write! : []), "Skill"];
  return [...new Set(tools)];
}

export const GENERATED = "<!-- Generated from the software factory's responsibility catalog. `factory team apply` rebuilds this file; edits to it are kept unless you pass --force. Remove this line to take it over. -->";

/** A role file: frontmatter plus one section per built responsibility the role holds. */
export function renderRole(name: string, preset: Preset = presets[DEFAULT_PRESET]!, skills: string[] = []): string {
  const role = preset.roles[name];
  if (!role) throw new Error(`no role "${name}" in the ${preset.title} team`);
  const built = role.holds.filter(isHeadless).map((id) => byId.get(id)!);
  if (!built.length) throw new Error(`${name} holds nothing that is built and runs unattended yet`);
  const sections = built.map((r) => `## ${r.title}\n\n${r.instruction}`).join("\n\n");
  const frontmatter = ["---", `name: ${name}`, `description: ${role.description}`, `tools: ${toolsFor(role.holds).join(", ")}`,
    ...(skills.length ? ["skills:", ...skills.map((s) => `  - ${s}`)] : []), "---"];
  return `${frontmatter.join("\n")}\n${GENERATED}\nYou are the ${role.title} of this project's software factory.\n\n${sections}\n`;
}

const CHAT_RULES = readFileSync(join(DATA, "CHAT.md"), "utf8").trim();

/**
 * The instructions for a conversation with the user, in their own session: the shared chat
 * rules, then one numbered step per built chat responsibility the role holds. `only` limits it
 * to some responsibilities (each command covers part of a role's job).
 */
export function chatPrompt(name: string, only: string[] = [], preset: Preset = presets[DEFAULT_PRESET]!): string {
  const role = preset.roles[name];
  if (!role) throw new Error(`no role "${name}" in the ${preset.title} team`);
  for (const id of only) if (!role.holds.includes(id)) throw new Error(`${name} does not hold ${id}`);
  const chosen = role.holds.filter((id) => isChat(id) && (!only.length || only.includes(id))).map((id) => byId.get(id)!);
  if (!chosen.length) throw new Error(`${name} has no conversational responsibilities that are built yet`);
  const steps = chosen.map((r, i) => `## ${chosen.length > 1 ? `Step ${i + 1}: ` : ""}${r.title}\n\n${r.instruction}`).join("\n\n");
  return `You are the ${role.title} of this project's software factory. ${role.description}\n\n# How to work with the user\n\n${CHAT_RULES}\n\n# Your task\n\n${chosen.length > 1 ? "Work through these steps in order, finishing and getting approval for each before the next.\n\n" : ""}${steps}\n`;
}

/** What `factory team` shows: each role, its responsibilities, what is built, and the task cost. */
export function describeTeam(preset: Preset = presets[DEFAULT_PRESET]!) {
  return Object.entries(preset.roles).map(([name, role]) => ({
    name, title: role.title, active: role.holds.some(isBuilt),
    built: role.holds.filter(isBuilt), planned: role.holds.filter((id) => !isBuilt(id)),
    // "chat": a conversation in your session; "agent": an unattended stage with a model setting.
    modes: [...(role.holds.some(isChat) ? ["chat"] : []), ...(role.holds.some(isHeadless) ? ["agent"] : [])],
  }));
}
