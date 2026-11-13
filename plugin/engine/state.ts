// Pure state derivation for the GUI. Everything on screen is a fold over the event log,
// so replaying a prefix of the log shows the factory as it was at that moment.
export type Ev = {
  seq: number; ts: string; run: string; task: string; stage: string; type: string;
  role?: string; model?: string; data?: any;
};
export type StageState = "active" | "ok" | "failed" | "limited" | "skipped";
export type TaskRun = {
  run: string;
  started: string;
  ended?: string;
  status: "running" | "done" | "failed";
  stages: Record<string, { state: StageState; model?: string; role?: string; since?: string }>;
  outputs: Record<string, string>;
  error?: string;
  cost: number;
  events: Ev[];
};

export const STAGES = ["triage", "spec", "build", "check", "review", "document"];

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
      t.stages[e.stage] = { state: "active", model: e.model, role: e.role, since: e.ts };
      // A rebuild invalidates what came after it: the old check and review no longer describe this build.
      for (const later of STAGES.slice(STAGES.indexOf(e.stage) + 1)) delete t.stages[later];
    } else if (e.type.startsWith("stage.")) {
      const kind = e.type.slice(6);
      t.stages[e.stage] = {
        ...t.stages[e.stage],
        state: kind === "ok" ? "ok" : kind === "rate_limited" ? "limited" : kind === "skipped" ? "skipped" : "failed",
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

export type Bucket = { t: number; stages: number; finished: number; failed: number; cost: number };

/** Activity in `n` equal time buckets between two instants: stages passed, tasks finished, failures, spend. */
export function series(events: Ev[], from: number, to: number, n: number): Bucket[] {
  const width = (to - from) / n;
  const out: Bucket[] = Array.from({ length: n }, (_, i) => ({ t: from + i * width, stages: 0, finished: 0, failed: 0, cost: 0 }));
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!(t >= from && t < to)) continue;
    const b = out[Math.min(n - 1, Math.floor((t - from) / width))]!;
    if (e.type === "stage.ok") { b.stages++; b.cost += e.data?.usage?.costUsd ?? 0; }
    else if (e.type === "run.done") b.finished++;
    else if (e.type === "run.failed" || e.type === "stage.failed" || e.type === "stage.error" || e.type === "stage.auth") b.failed++;
  }
  return out;
}

/** How often the gate passed, and how often a review approved. */
export function passRates(events: Ev[]) {
  const r = { gate: { ok: 0, total: 0 }, review: { ok: 0, total: 0 } };
  for (const e of events) {
    if (e.stage === "check" && (e.type === "stage.ok" || e.type === "stage.failed")) { r.gate.total++; if (e.type === "stage.ok") r.gate.ok++; }
    if (e.stage === "review" && e.type === "stage.ok") { r.review.total++; if (/^APPROVE\b/.test(e.data?.output ?? "")) r.review.ok++; }
  }
  return r;
}

/** The agents working right now: one row per task with a stage in flight. */
export function roster(tasks: Map<string, TaskRun>) {
  return [...tasks].flatMap(([task, run]) => {
    if (run.status !== "running") return [];
    const active = Object.entries(run.stages).find(([, s]) => s.state === "active");
    return active ? [{ task, stage: active[0], role: active[1].role ?? "gate", model: active[1].model ?? "", since: active[1].since ?? run.started }] : [];
  });
}
