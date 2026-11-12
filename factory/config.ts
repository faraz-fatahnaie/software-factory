import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROLES = ["triage", "architect", "builder", "reviewer"] as const;
export type Role = (typeof ROLES)[number];
const RUNNERS = ["claude"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export type RoleConfig = { runner: string; model: string; effort: string; fallback: string[] };
export type Config = { gate: string[]; roles: Record<Role, RoleConfig> };

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Validates untrusted JSON; throws one error listing every problem. */
export function parseConfig(raw: unknown): Config {
  const c = (raw ?? {}) as Record<string, any>;
  const errs: string[] = [];
  if (!isStrList(c.gate)) errs.push("gate: must be a list of commands");
  for (const name of Object.keys(c.roles ?? {}))
    if (!ROLES.includes(name as Role)) errs.push(`roles.${name}: unknown role`);
  for (const role of ROLES) {
    const r = c.roles?.[role];
    if (!r) { errs.push(`roles.${role}: missing`); continue; }
    if (!RUNNERS.includes(r.runner)) errs.push(`roles.${role}.runner: must be one of ${RUNNERS}`);
    if (!isStr(r.model)) errs.push(`roles.${role}.model: required`);
    if (!EFFORTS.includes(r.effort)) errs.push(`roles.${role}.effort: must be one of ${EFFORTS}`);
    if (!isStrList(r.fallback)) errs.push(`roles.${role}.fallback: must be a list of models`);
  }
  if (errs.length) throw new Error(`Invalid factory.config.json:\n  ${errs.join("\n  ")}`);
  return c as Config;
}

export const loadConfig = (dir: string) =>
  parseConfig(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")));
