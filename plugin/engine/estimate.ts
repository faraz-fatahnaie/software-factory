// What a task costs with a given team: which role runs each stage, on which model, and what that stage cost before.
import type { Config } from "./config";
import { holderOf, perTask, STAGE_DUTIES, stageRole, type Preset } from "./team";

type EventLike = { stage: string; type: string; model?: string | null; data?: any };
export type StageEstimate = { stage: string; role: string; title: string; model: string; effort: string; usd: number; basis: "runs" | "guide"; always: boolean };

// Rough cost of one stage, used only for a model the project has not run yet. Replaced by real figures as runs happen.
const GUIDE: Record<string, number> = { haiku: 0.03, sonnet: 0.15, opus: 0.6, fable: 0.6 };
const guide = (model: string) => GUIDE[Object.keys(GUIDE).find((k) => model.includes(k)) ?? "sonnet"]!;

/** Average cost of a finished stage, by stage and model, from the event log. */
export function stageAverages(events: EventLike[]): Map<string, { sum: number; n: number }> {
  const by = new Map<string, { sum: number; n: number }>();
  for (const e of events) {
    if (e.type !== "stage.ok" || !e.model || typeof e.data?.usage?.costUsd !== "number") continue;
    for (const key of [`${e.stage}|${e.model}`, `*|${e.model}`]) {
      const row = by.get(key) ?? { sum: 0, n: 0 };
      row.sum += e.data.usage.costUsd; row.n++;
      by.set(key, row);
    }
  }
  return by;
}

/** The stages a task goes through in this team, who runs each, and what it should cost. Stages nobody holds are left out. */
export function estimate(team: Preset, config: Pick<Config, "roles">, events: EventLike[] = []) {
  const averages = stageAverages(events);
  const always = new Set(["spec", "build", "review"]);
  const stages: StageEstimate[] = [];
  for (const stage of Object.keys(STAGE_DUTIES)) {
    const role = stageRole(team, stage);
    const c = role && config.roles[role];
    if (!role || !c) continue; // nobody runs it, or the role only chats
    const own = { ...c, ...c.stages?.[stage] };
    const seen = averages.get(`${stage}|${own.model}`) ?? averages.get(`*|${own.model}`);
    stages.push({
      stage, role, title: team.roles[role]!.title, model: own.model, effort: own.effort, always: always.has(stage),
      usd: seen ? seen.sum / seen.n : guide(own.model), basis: seen ? "runs" : "guide",
    });
  }
  const usual = stages.filter((s) => s.always);
  return {
    stages, agents: perTask(team), usd: usual.reduce((sum, s) => sum + s.usd, 0),
    // "runs" only when every figure came from this project's own history.
    basis: usual.every((s) => s.basis === "runs") ? "runs" as const : "guide" as const,
    // The holder of each always-on stage, for the "who joins" line in the GUI.
    holders: Object.fromEntries(["B1", "B2", "C1"].map((id) => [id, holderOf(team, id)])),
  };
}
