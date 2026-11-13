// Changing a project's team: each function takes the team settings and returns the new ones;
// `changeTeam` checks the result against the rules, updates the config and rebuilds the role files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig, teamOf, type Config } from "./config";
import { applyTeam } from "./init";
import { activeRoles, checkSettings, DEFAULT_PRESET, mergeRoles, ROLE_NAME, resolveTeam, STAGE_DUTIES, stageRole, teamForAgents, validateTeam, type Custom, type Preset, type TeamSettings } from "./team";

const ID = /^[A-Z]\d{1,3}$/;
const ids = (list: string[]) => { for (const id of list) if (!ID.test(id)) throw new Error(`"${id}" is not a responsibility id (like D1 or S4)`); return list; };

/** A different preset. The moves and switched-off responsibilities belonged to the old grouping and are cleared; custom responsibilities stay. */
export const useSettings = (s: TeamSettings, preset: string): TeamSettings => ({ preset, ...(s.custom && { custom: s.custom }) });

export const moveSettings = (s: TeamSettings, list: string[], role: string): TeamSettings => {
  if (!ROLE_NAME.test(role)) throw new Error(`"${role}" is not a role name (lowercase letters, digits and dashes)`);
  return { ...s, move: { ...s.move, ...Object.fromEntries(ids(list).map((id) => [id, role])) }, ...(s.off && { off: s.off.filter((id) => !list.includes(id)) }) };
};

export const offSettings = (s: TeamSettings, list: string[]): TeamSettings => {
  const move = { ...s.move };
  for (const id of ids(list)) delete move[id];
  return { ...s, move, off: [...new Set([...(s.off ?? []), ...list])] };
};

export const onSettings = (s: TeamSettings, list: string[]): TeamSettings => ({ ...s, off: (s.off ?? []).filter((id) => !ids(list).includes(id)) });

export const titleSettings = (s: TeamSettings, role: string, title: string): TeamSettings => ({ ...s, titles: { ...s.titles, [role]: title } });

export function renameSettings(s: TeamSettings, from: string, to: string, title?: string): TeamSettings {
  const merged = mergeRoles(s, from, to);
  return title ? titleSettings(merged, to, title) : merged;
}

export function addCustom(s: TeamSettings, c: Omit<Custom, "id" | "how" | "access"> & { access?: string[] }): TeamSettings {
  const next = Math.max(0, ...(s.custom ?? []).map((x) => Number(x.id.slice(1)))) + 1;
  const entry: Custom = { ...c, id: `U${next}`, how: c.when === "task" ? "headless" : "chat", access: c.access ?? ["read"] };
  return { ...s, custom: [...(s.custom ?? []), entry] };
}

export function removeCustom(s: TeamSettings, id: string): TeamSettings {
  if (!(s.custom ?? []).some((c) => c.id === id)) throw new Error(`there is no custom responsibility ${id}`);
  const move = { ...s.move };
  delete move[id];
  return { ...s, custom: s.custom!.filter((c) => c.id !== id), move, off: (s.off ?? []).filter((x) => x !== id) };
}

export { teamForAgents };

/**
 * Applies a change to the project's team. Nothing is written unless the new team obeys every rule.
 * Models, effort and fallbacks of roles that stay are kept (`rename` carries a renamed role's settings
 * and attached skills); roles that appear get their default settings. Returns what to commit and what changed.
 */
export function changeTeam(dir: string, edit: (s: TeamSettings) => TeamSettings, opts: { rename?: Record<string, string> } = {}) {
  const file = join(dir, "factory.config.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const next = edit(structuredClone(raw.team ?? { preset: DEFAULT_PRESET }));
  const clean: TeamSettings = {
    preset: next.preset ?? DEFAULT_PRESET,
    ...(next.move && Object.keys(next.move).length && { move: next.move }),
    ...(next.off?.length && { off: next.off }),
    ...(next.titles && Object.keys(next.titles).length && { titles: next.titles }),
    ...(next.custom?.length && { custom: next.custom }),
  };
  const shape = checkSettings(clean);
  if (shape.length) throw new Error(`that change is not valid:\n  - ${shape.join("\n  - ")}`);
  const team: Preset = resolveTeam(clean);
  const broken = validateTeam(team);
  if (broken.length) throw new Error(`that change breaks a rule every team must obey, so nothing was changed:\n  - ${broken.join("\n  - ")}`);

  const before = raw.roles ?? {};
  const renamedFrom = Object.fromEntries(Object.entries(opts.rename ?? {}).map(([old, to]) => [to, old]));
  const roles = Object.fromEntries(activeRoles(team).map((name) => {
    const kept = before[name] ?? before[renamedFrom[name] ?? ""];
    return [name, kept ?? { runner: "claude", ...team.roles[name]!.defaults! }];
  }));
  // Regrouping must not change what a stage costs: a stage that moves to another role keeps the model
  // settings it had, as a per-stage setting, unless the new role already uses the same ones.
  const oldTeam = teamOf(raw);
  const pick = (c: any) => ({ model: c.model, effort: c.effort, fallback: c.fallback });
  const effective = (c: any, stage: string) => pick({ ...c, ...c.stages?.[stage] });
  for (const stage of Object.keys(STAGE_DUTIES)) {
    const was = stageRole(oldTeam, stage), now = stageRole(team, stage);
    if (!was || !now || (opts.rename?.[was] ?? was) === now || !before[was]) continue;
    const source = effective(before[was], stage), target = roles[now] as any;
    if (JSON.stringify(source) === JSON.stringify(pick(target))) { if (target.stages) delete target.stages[stage]; continue; }
    target.stages = { ...target.stages, [stage]: source };
  }
  for (const [name, r] of Object.entries<any>(roles)) { // a role keeps overrides only for stages it still runs
    for (const stage of Object.keys(r.stages ?? {})) if (stageRole(team, stage) !== name && stage !== "extra") delete r.stages[stage];
    if (r.stages && !Object.keys(r.stages).length) delete r.stages;
  }
  const config: Config = parseConfig({ ...raw, team: clean, roles });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);

  // A renamed role keeps its attached skills: its new file starts as a copy of the old one.
  for (const [old, to] of Object.entries(opts.rename ?? {})) {
    const from = join(dir, ".claude", "agents", `${old}.md`), target = join(dir, ".claude", "agents", `${to}.md`);
    if (existsSync(from) && !existsSync(target) && activeRoles(team).includes(to)) writeFileSync(target, readFileSync(from, "utf8").replace(/^name: .*$/m, `name: ${to}`));
  }
  const applied = applyTeam(dir);
  return { config, team, lines: applied.lines, paths: ["factory.config.json", ...applied.paths] };
}
