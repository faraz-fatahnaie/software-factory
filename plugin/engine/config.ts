import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeRoles, DEFAULT_PRESET, presets } from "./team";

/** The roles that exist today: those holding at least one built responsibility in the default team. */
export const ROLES: readonly string[] = activeRoles();
export type Role = string;
const RUNNERS = ["claude"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** `enabled: false` switches an optional role off (today only the scribe is optional). */
export type RoleConfig = { runner: string; model: string; effort: string; fallback: string[]; enabled?: boolean };
/** `setup` runs once in each new task worktree (for example `bun install`); `gate` must pass before review. */
/** `graph: false` turns off the knowledge graph (it is on by default and needs graphify installed). */
/** Tunes when the security engineer reviews a task: `always`, plus extra file-path fragments and words that count as sensitive. */
export type SecuritySettings = { always?: boolean; paths?: string[]; keywords?: string[] };
export type Config = { setup?: string[]; gate: string[]; graph?: boolean; security?: SecuritySettings; roles: Record<Role, RoleConfig> };

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
// Model names become command-line arguments, so they may not look like an option.
const isModel = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][\w.:[\]-]*$/.test(v);
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

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
  for (const name of Object.keys(c.roles ?? {}))
    if (!ROLES.includes(name as Role)) errs.push(`roles.${name}: unknown role`);
  for (const role of ROLES) {
    const r = c.roles?.[role];
    if (!r) { errs.push(`roles.${role}: missing`); continue; }
    if (!RUNNERS.includes(r.runner)) errs.push(`roles.${role}.runner: must be one of ${RUNNERS}`);
    if (!isModel(r.model)) errs.push(`roles.${role}.model: a model name such as sonnet or claude-opus-5-5`);
    if (!EFFORTS.includes(r.effort)) errs.push(`roles.${role}.effort: must be one of ${EFFORTS}`);
    if (!Array.isArray(r.fallback) || !r.fallback.every(isModel)) errs.push(`roles.${role}.fallback: must be a list of model names`);
    if (r.enabled !== undefined && typeof r.enabled !== "boolean") errs.push(`roles.${role}.enabled: must be true or false`);
  }
  if (errs.length) throw new Error(`Invalid factory.config.json:\n  ${errs.join("\n  ")}`);
  // Rebuilt from known keys only: this object is also what the GUI's model matrix writes back to disk.
  const roles = Object.fromEntries(ROLES.map((role) => {
    const { runner, model, effort, fallback, enabled } = c.roles[role];
    return [role, { runner, model, effort, fallback, ...(enabled !== undefined && { enabled }) }];
  })) as Record<Role, RoleConfig>;
  return { ...(c.setup && { setup: c.setup }), gate: c.gate, ...(c.graph !== undefined && { graph: c.graph }),
    ...(c.security && { security: { ...(c.security.always !== undefined && { always: c.security.always }), ...(c.security.paths && { paths: c.security.paths }), ...(c.security.keywords && { keywords: c.security.keywords }) } }), roles };
}

/** A config written by an older plugin lacks any role added since: give it that role's default instead of failing. */
export function loadConfig(dir: string): Config {
  const raw = JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8"));
  const roles = { ...(raw?.roles ?? {}) };
  for (const name of ROLES) if (!roles[name] && presets[DEFAULT_PRESET]!.roles[name]?.defaults) roles[name] = { runner: "claude", ...presets[DEFAULT_PRESET]!.roles[name]!.defaults };
  return parseConfig({ ...raw, roles });
}
