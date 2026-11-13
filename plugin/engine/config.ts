import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { activeRoles, checkSettings, resolveTeam, STAGE_DUTIES, validateTeam, type Preset, type TeamSettings } from "./team";

export type Role = string;
const RUNNERS = ["claude"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export type StageConfig = { model: string; effort: string; fallback: string[] };
/**
 * `enabled: false` switches an optional role off (today only the scribe and the security engineer are optional).
 * `stages` gives one stage of a role its own model settings: a cheap stage keeps its cheap model when a regrouping
 * moves it into an expensive role (for example the summary after a task, when the scribe is folded into the architect).
 */
export type RoleConfig = { runner: string; model: string; effort: string; fallback: string[]; enabled?: boolean; stages?: Record<string, StageConfig> };
/** Tunes when the security engineer reviews a task: `always`, plus extra file-path fragments and words that count as sensitive. */
export type SecuritySettings = { always?: boolean; paths?: string[]; keywords?: string[] };
/**
 * `setup` runs once in each new task worktree (for example `bun install`); `gate` must pass before review.
 * `graph: false` turns off the knowledge graph (on by default; it needs graphify installed).
 * `team` is the project's team: a preset plus its own changes. `roles` holds the model settings of the roles that run unattended.
 */
/** `autoMerge`: merge a pull request as soon as its checks pass, with no wait for a person. Off unless the person turns it on. */
export type VcsSettings = { autoMerge?: boolean };
export type Config = { setup?: string[]; gate: string[]; graph?: boolean; security?: SecuritySettings; vcs?: VcsSettings; team?: TeamSettings; roles: Record<Role, RoleConfig> };

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
// Model names become command-line arguments, so they may not look like an option.
const isModel = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][\w.:[\]-]*$/.test(v);
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** The team a config describes. Throws when the team section is invalid or breaks a rule every team must obey. */
export function teamOf(raw: { team?: unknown } | undefined): Preset {
  if (raw?.team === undefined) return resolveTeam();
  const shape = checkSettings(raw.team);
  if (shape.length) throw new Error(shape.join("; "));
  const team = resolveTeam(raw.team as TeamSettings);
  const broken = validateTeam(team);
  if (broken.length) throw new Error(broken.join("; "));
  return team;
}

/** A project's team, without throwing: a missing or unreadable config means the default team. */
export function projectTeam(dir: string): Preset {
  try {
    const file = join(dir, "factory.config.json");
    return teamOf(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined);
  } catch { return resolveTeam(); }
}

/** The roles that run unattended in a project, without throwing: a missing or unreadable config means the default team. */
export const projectRoles = (dir: string): string[] => activeRoles(projectTeam(dir));

/** Validates untrusted JSON; throws one error listing every problem. */
export function parseConfig(raw: unknown): Config {
  const c = (raw ?? {}) as Record<string, any>;
  const errs: string[] = [];
  if (!isStrList(c.gate)) errs.push("gate: must be a list of commands");
  if (c.setup !== undefined && !isStrList(c.setup)) errs.push("setup: must be a list of commands");
  if (c.graph !== undefined && typeof c.graph !== "boolean") errs.push("graph: must be true or false");
  if (c.security !== undefined) {
    const sec = c.security;
    if (typeof sec !== "object" || sec === null || Array.isArray(sec)) errs.push("security: must be an object");
    else {
      if (sec.always !== undefined && typeof sec.always !== "boolean") errs.push("security.always: must be true or false");
      for (const key of ["paths", "keywords"]) if (sec[key] !== undefined && !isStrList(sec[key])) errs.push(`security.${key}: must be a list of words`);
    }
  }
  if (c.vcs !== undefined && (typeof c.vcs !== "object" || c.vcs === null || Array.isArray(c.vcs) || (c.vcs.autoMerge !== undefined && typeof c.vcs.autoMerge !== "boolean"))) errs.push("vcs: must be an object, and vcs.autoMerge must be true or false");
  let roleNames: string[] = [];
  try { roleNames = activeRoles(teamOf(c)); } catch (e) { errs.push(`team: ${(e as Error).message}`); }
  for (const name of Object.keys(c.roles ?? {}))
    if (roleNames.length && !roleNames.includes(name)) errs.push(`roles.${name}: unknown role`);
  for (const role of roleNames) {
    const r = c.roles?.[role];
    if (!r) { errs.push(`roles.${role}: missing`); continue; }
    if (!RUNNERS.includes(r.runner)) errs.push(`roles.${role}.runner: must be one of ${RUNNERS}`);
    if (!isModel(r.model)) errs.push(`roles.${role}.model: a model name such as sonnet or claude-opus-5-5`);
    if (!EFFORTS.includes(r.effort)) errs.push(`roles.${role}.effort: must be one of ${EFFORTS}`);
    if (!Array.isArray(r.fallback) || !r.fallback.every(isModel)) errs.push(`roles.${role}.fallback: must be a list of model names`);
    if (r.enabled !== undefined && typeof r.enabled !== "boolean") errs.push(`roles.${role}.enabled: must be true or false`);
    if (r.stages !== undefined) {
      if (typeof r.stages !== "object" || r.stages === null || Array.isArray(r.stages)) errs.push(`roles.${role}.stages: must be an object`);
      else for (const [stage, st] of Object.entries<any>(r.stages)) {
        if (![...Object.keys(STAGE_DUTIES), "extra"].includes(stage)) errs.push(`roles.${role}.stages.${stage}: unknown stage`);
        if (!isModel(st?.model) || !EFFORTS.includes(st?.effort) || !Array.isArray(st?.fallback) || !st.fallback.every(isModel)) errs.push(`roles.${role}.stages.${stage}: needs a model, an effort and a fallback list`);
      }
    }
  }
  if (errs.length) throw new Error(`Invalid factory.config.json:\n  ${errs.join("\n  ")}`);
  // Rebuilt from known keys only: this object is also what the GUI's model matrix writes back to disk.
  const roles = Object.fromEntries(roleNames.map((role) => {
    const { runner, model, effort, fallback, enabled, stages } = c.roles[role];
    const own = stages && Object.fromEntries(Object.entries<any>(stages).map(([k, v]) => [k, { model: v.model, effort: v.effort, fallback: v.fallback }]));
    return [role, { runner, model, effort, fallback, ...(enabled !== undefined && { enabled }), ...(own && Object.keys(own).length && { stages: own }) }];
  })) as Record<Role, RoleConfig>;
  const team = c.team as TeamSettings | undefined;
  return { ...(c.setup && { setup: c.setup }), gate: c.gate, ...(c.graph !== undefined && { graph: c.graph }), ...(c.vcs && { vcs: { ...(c.vcs.autoMerge !== undefined && { autoMerge: c.vcs.autoMerge }) } }),
    ...(c.security && { security: { ...(c.security.always !== undefined && { always: c.security.always }), ...(c.security.paths && { paths: c.security.paths }), ...(c.security.keywords && { keywords: c.security.keywords }) } }),
    ...(team && { team: { ...(team.preset && { preset: team.preset }), ...(team.move && Object.keys(team.move).length && { move: team.move }), ...(team.off?.length && { off: team.off }), ...(team.titles && Object.keys(team.titles).length && { titles: team.titles }), ...(team.custom?.length && { custom: team.custom }) } }),
    roles };
}

/** A config written by an older plugin lacks any role added since: give it that role's default instead of failing. */
export function loadConfig(dir: string): Config {
  const raw = JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8"));
  const roles = { ...(raw?.roles ?? {}) };
  try {
    const team = teamOf(raw);
    for (const name of activeRoles(team)) if (!roles[name] && team.roles[name]?.defaults) roles[name] = { runner: "claude", ...team.roles[name]!.defaults };
  } catch { /* an invalid team is reported by parseConfig below */ }
  return parseConfig({ ...raw, roles });
}
