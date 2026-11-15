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
export type VcsSettings = { autoMerge?: boolean; /** Push a task and open its pull request the moment a person approves it. Off unless the person turns it on. */ autoPush?: boolean };
/** `suggest`: per role, whether its conversation ends with a few suggested next messages. Unset means on for the Product Partner and off for the others. */
export type ChatSettings = { suggest?: Record<string, boolean> };
/**
 * What the Technical Manager may do by itself. `autonomy`: autopilot promotes what was agreed in conversation, starts it, and recovers a stuck task;
 * assist only proposes (you press the buttons); off does nothing by itself. `parallel`: tasks at once. `recoveries`: automatic retries per task.
 * `perTask` and `perDay`: spend limits in US dollars. `stall`: minutes without any sign of life before a running task is stopped.
 */
export type Autonomy = "autopilot" | "assist" | "off";
export type ManagerSettings = { autonomy?: Autonomy; parallel?: number; recoveries?: number; perTask?: number; perDay?: number; stall?: number };
export const AUTONOMY: Autonomy[] = ["autopilot", "assist", "off"];
export const MANAGER_DEFAULTS: Required<ManagerSettings> = { autonomy: "autopilot", parallel: 1, recoveries: 2, perTask: 5, perDay: 25, stall: 20 };
export const managerOf = (c: { manager?: ManagerSettings }): Required<ManagerSettings> => ({ ...MANAGER_DEFAULTS, ...c.manager });
const MANAGER_RULES: Record<keyof ManagerSettings, (v: unknown) => boolean> = {
  autonomy: (v) => AUTONOMY.includes(v as Autonomy), parallel: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 8,
  recoveries: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5, perTask: (v) => typeof v === "number" && v > 0 && v <= 1000,
  perDay: (v) => typeof v === "number" && v > 0 && v <= 10000, stall: (v) => Number.isInteger(v) && (v as number) >= 5 && (v as number) <= 240,
};
export type Config = { setup?: string[]; gate: string[]; graph?: boolean; security?: SecuritySettings; vcs?: VcsSettings; chat?: ChatSettings; manager?: ManagerSettings; team?: TeamSettings; roles: Record<Role, RoleConfig> };

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
  if (c.vcs !== undefined && (typeof c.vcs !== "object" || c.vcs === null || Array.isArray(c.vcs) || (c.vcs.autoMerge !== undefined && typeof c.vcs.autoMerge !== "boolean") || (c.vcs.autoPush !== undefined && typeof c.vcs.autoPush !== "boolean"))) errs.push("vcs: must be an object, and vcs.autoMerge and vcs.autoPush must be true or false");
  if (c.chat !== undefined) {
    const s = c.chat?.suggest;
    if (typeof c.chat !== "object" || c.chat === null || Array.isArray(c.chat) || (s !== undefined && (typeof s !== "object" || s === null || Array.isArray(s) || Object.values(s).some((v) => typeof v !== "boolean")))) errs.push("chat: must be an object, and chat.suggest must map role names to true or false");
  }
  if (c.manager !== undefined) {
    if (typeof c.manager !== "object" || c.manager === null || Array.isArray(c.manager)) errs.push("manager: must be an object");
    else for (const [k, v] of Object.entries(c.manager)) {
      if (!(k in MANAGER_RULES)) errs.push(`manager.${k}: unknown setting (autonomy, parallel, recoveries, perTask, perDay, stall)`);
      else if (!MANAGER_RULES[k as keyof ManagerSettings](v)) errs.push(`manager.${k}: ${k === "autonomy" ? `one of ${AUTONOMY.join(", ")}` : "a number in range (parallel 1 to 8, recoveries 0 to 5, perTask and perDay in dollars, stall 5 to 240 minutes)"}`);
    }
  }
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
  return { ...(c.setup && { setup: c.setup }), gate: c.gate, ...(c.graph !== undefined && { graph: c.graph }), ...(c.vcs && { vcs: { ...(c.vcs.autoMerge !== undefined && { autoMerge: c.vcs.autoMerge }), ...(c.vcs.autoPush !== undefined && { autoPush: c.vcs.autoPush }) } }), ...(c.manager && Object.keys(c.manager).length && { manager: { ...c.manager } }), ...(c.chat && { chat: { ...(c.chat.suggest && { suggest: { ...c.chat.suggest } }) } }),
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
