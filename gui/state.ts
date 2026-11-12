// Pure state derivation for the GUI. Everything on screen is a fold over the event log,
// so replaying a prefix of the log shows the factory as it was at that moment.
export type Ev = {
  seq: number; ts: string; run: string; task: string; stage: string; type: string;
  role?: string; model?: string; data?: any;
};
export type StageState = "active" | "ok" | "failed" | "limited";
export type TaskRun = {
  run: string;
  started: string;
  ended?: string;
  status: "running" | "done" | "failed";
  stages: Record<string, { state: StageState; model?: string }>;
  outputs: Record<string, string>;
  error?: string;
  cost: number;
  events: Ev[];
};

export const STAGES = ["triage", "spec", "build", "check", "review"];

/** Folds events into each task's latest run, the newest rate-limit reading, and the last command failure. */
export function summarize(events: Ev[]) {
  const tasks = new Map<string, TaskRun>();
  let rateLimit: any, notice: Ev | undefined;
  for (const e of events) {
    if (e.type === "agent.rate_limit") rateLimit = e.data;
    if (e.type === "command.failed") notice = e;
    if (e.type === "run.start")
      tasks.set(e.task, { run: e.run, started: e.ts, status: "running", stages: {}, outputs: {}, cost: 0, events: [] });
    const t = tasks.get(e.task);
    if (!t) continue;
    t.events.push(e);
    if (e.type === "stage.start") {
      t.stages[e.stage] = { state: "active", model: e.model };
      // A rebuild invalidates what came after it: the old check and review no longer describe this build.
      for (const later of STAGES.slice(STAGES.indexOf(e.stage) + 1)) delete t.stages[later];
    } else if (e.type.startsWith("stage.")) {
      const kind = e.type.slice(6);
      t.stages[e.stage] = {
        state: kind === "ok" ? "ok" : kind === "rate_limited" ? "limited" : "failed",
        model: e.model ?? t.stages[e.stage]?.model,
      };
      t.cost += e.data?.usage?.costUsd ?? 0;
      if (kind === "ok" && e.data?.output) t.outputs[e.stage] = e.data.output;
    } else if (e.type === "run.done" || e.type === "run.failed") {
      t.status = e.type === "run.done" ? "done" : "failed";
      t.ended = e.ts;
      if (t.status === "failed") {
        t.error = String(e.data ?? "failed");
        for (const s of Object.values(t.stages)) if (s.state === "active") s.state = "failed";
      }
    }
  }
  return { tasks, rateLimit, notice };
}

/** One readable line for a tool call: the part of its input a person would look for. */
export function toolLine(data: { tool?: string; input?: any }): string {
  const i = data.input;
  const detail = typeof i === "string" ? i : i?.command ?? i?.file_path ?? i?.pattern ?? i?.skill ?? i?.url ?? i?.query ?? JSON.stringify(i ?? {});
  return `${data.tool ?? "tool"}  ${String(detail).replace(/\s+/g, " ").slice(0, 200)}`;
}

export function elapsed(fromIso: string, toMs: number): string {
  const s = Math.max(0, Math.round((toMs - Date.parse(fromIso)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export type CostRow = { stages: number; ok: number; cost: number; input: number; output: number };

/** Spend, tokens and pass rate of model stages, grouped by model, role and task. */
export function costs(events: Ev[]) {
  const by = { model: new Map<string, CostRow>(), role: new Map<string, CostRow>(), task: new Map<string, CostRow>() };
  for (const e of events) {
    // Finished model stages only: the check stage has no model, and agent.* events carry no usage.
    if (!e.type.startsWith("stage.") || e.type === "stage.start" || !e.model) continue;
    const u = e.data?.usage ?? {};
    for (const [dim, key] of [["model", e.model], ["role", e.role ?? "?"], ["task", e.task]] as const) {
      const row = by[dim].get(key) ?? { stages: 0, ok: 0, cost: 0, input: 0, output: 0 };
      row.stages++;
      if (e.type === "stage.ok") row.ok++;
      row.cost += u.costUsd ?? 0;
      row.input += (u.inputTokens ?? 0) + (u.cacheWriteTokens ?? 0) + (u.cacheReadTokens ?? 0);
      row.output += u.outputTokens ?? 0;
      by[dim].set(key, row);
    }
  }
  return by;
}

export async function post(path: string, body: unknown): Promise<{ ok: boolean; error: string }> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, error: data.error ?? data.output ?? `request failed (${res.status})` };
}
