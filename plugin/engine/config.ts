import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROLES = ["triage", "architect", "builder", "reviewer"] as const;
export type Role = (typeof ROLES)[number];
const RUNNERS = ["claude"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export type RoleConfig = { runner: string; model: string; effort: string; fallback: string[] };
/** `setup` runs once in each new task worktree (for example `bun install`); `gate` must pass before review. */
export type Config = { setup?: string[]; gate: string[]; roles: Record<Role, RoleConfig> };

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
  for (const name of Object.keys(c.roles ?? {}))
    if (!ROLES.includes(name as Role)) errs.push(`roles.${name}: unknown role`);
  for (const role of ROLES) {
    const r = c.roles?.[role];
    if (!r) { errs.push(`roles.${role}: missing`); continue; }
    if (!RUNNERS.includes(r.runner)) errs.push(`roles.${role}.runner: must be one of ${RUNNERS}`);
    if (!isModel(r.model)) errs.push(`roles.${role}.model: a model name such as sonnet or claude-opus-5-5`);
    if (!EFFORTS.includes(r.effort)) errs.push(`roles.${role}.effort: must be one of ${EFFORTS}`);
    if (!Array.isArray(r.fallback) || !r.fallback.every(isModel)) errs.push(`roles.${role}.fallback: must be a list of model names`);
  }
  if (errs.length) throw new Error(`Invalid factory.config.json:\n  ${errs.join("\n  ")}`);
  // Rebuilt from known keys only: this object is also what the GUI's model matrix writes back to disk.
  const roles = Object.fromEntries(ROLES.map((role) => {
    const { runner, model, effort, fallback } = c.roles[role];
    return [role, { runner, model, effort, fallback }];
  })) as Record<Role, RoleConfig>;
  return { ...(c.setup && { setup: c.setup }), gate: c.gate, roles };
}

export const loadConfig = (dir: string) =>
  parseConfig(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")));
