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
  /** 1 for a normal run; 2 after a person sent it back once. */
  round: number;
  /** What people said when they sent it back, oldest first (round is the round they commented on). */
  feedback: { round: number; text: string; files: string[]; ts: string; update?: boolean }[];
};

export const STAGES = ["triage", "spec", "build", "check", "security", "review", "document"];

/** Folds events into each task's latest run, the newest rate-limit reading, and the last command failure. */
export function summarize(events: Ev[]) {
  const tasks = new Map<string, TaskRun>();
  let rateLimit: any, notice: Ev | undefined;
  for (const e of events) {
    if (e.type === "agent.rate_limit") rateLimit = e.data;
    if (e.type === "command.failed") notice = e;
    if (e.type === "run.start") {
      const before = tasks.get(e.task), said = e.data?.feedback ? [{ round: (e.data.round ?? 2) - 1, text: String(e.data.feedback), files: (e.data.files ?? []) as string[], ts: e.ts, ...(e.data.update === true ? { update: true } : {}) }] : [];
      tasks.set(e.task, { run: e.run, started: e.ts, status: "running", stages: {}, outputs: {}, cost: 0, events: [], round: e.data?.round ?? 1, feedback: e.data?.round ? [...(before?.feedback ?? []), ...said] : [] });
    }
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
  return `${data.tool ?? "tool"}  ${toolDetail(data.input).replace(/\s+/g, " ").slice(0, 200)}`;
}
/** The part of a tool call's input a person would look for, whole (a command, a path, a pattern). */
export function toolDetail(i: any): string {
  return String(typeof i === "string" ? i : i?.command ?? i?.file_path ?? i?.pattern ?? i?.skill ?? i?.url ?? i?.query ?? JSON.stringify(i ?? {}));
}
/** One thing a conversation did, shown in the page as a collapsed step: what it was, and what came back. */
export type ToolStep = { tool: string; detail: string; output?: string; error?: boolean };
const KINDS: Record<string, [string, string, string]> = { Bash: ["ran", "command", "commands"], Read: ["read", "file", "files"], Grep: ["searched", "time", "times"], Glob: ["searched", "time", "times"], Write: ["wrote", "file", "files"], Edit: ["edited", "file", "files"], WebFetch: ["opened", "web page", "web pages"], WebSearch: ["searched the web", "time", "times"], Skill: ["used", "skill", "skills"] };
/** "Ran 2 commands, read 3 files": the one line a group of steps folds into. */
export function stepsSummary(steps: ToolStep[]): string {
  const n = new Map<string, number>(), asked: string[] = [];
  for (const s of steps) { if (s.tool.startsWith("Asked ")) asked.push(s.tool.slice(6)); else n.set(s.tool, (n.get(s.tool) ?? 0) + 1); }
  const parts = [...(asked.length ? [`asked ${asked.join(", ")}`] : []), ...[...n].map(([tool, c]) => { const [verb, one, many] = KINDS[tool] ?? ["used", tool, tool]; return `${verb} ${c} ${c === 1 ? one : many}`; })];
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
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

// ---------------------------------------------------------------------------------------------------------------- what an agent is doing

export type Doing = { verb: string; what: string };
/** A path as a person knows it: without the task worktree in front, and at most the last three folders. */
export const shortPath = (p: unknown) => {
  const rest = String(p ?? "").replace(/^.*?\.worktrees\/[\w-]+\//, "");
  const parts = rest.split("/").filter(Boolean);
  return parts.length > 3 ? parts.slice(-3).join("/") : parts.join("/");
};
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** A tool call in a few plain words: "Editing src/app.ts", "Running bun test". */
export function doing(data: { tool?: string; input?: any }): Doing {
  const i = data.input ?? {};
  const file = shortPath(i.file_path ?? i.path ?? i.notebook_path);
  switch (data.tool) {
    case "Read": return { verb: "Reading", what: file };
    case "Edit": case "MultiEdit": case "NotebookEdit": return { verb: "Editing", what: file };
    case "Write": return { verb: "Writing", what: file };
    case "Grep": case "Glob": return { verb: "Searching for", what: clip(String(i.pattern ?? ""), 60) };
    case "Bash": return { verb: "Running", what: clip(String(i.command ?? "").split("\n")[0]!.trim(), 70) };
    case "Skill": return { verb: "Using the skill", what: String(i.skill ?? "") };
    case "WebSearch": return { verb: "Searching the web for", what: clip(String(i.query ?? ""), 60) };
    case "WebFetch": return { verb: "Reading", what: clip(String(i.url ?? "").replace(/^https?:\/\//, ""), 60) };
    case "TodoWrite": return { verb: "Planning the steps", what: "" };
    case "Task": case "Agent": return { verb: "Asking a helper", what: "" };
    default: return { verb: data.tool ?? "Working", what: "" };
  }
}

export type Live = { now: Doing; last?: string; recent: { ts: string; verb: string; what: string; said: boolean }[] };
/** The newest actions of the stage a task is in: what the agent is doing now, when it last did anything, and the few before. Reads backwards and stops at the stage's start. */
export function liveOf(run: TaskRun | undefined, stage: string, limit = 5): Live {
  const recent: Live["recent"] = [];
  let last: string | undefined;
  for (let k = (run?.events.length ?? 0) - 1; k >= 0; k--) {
    const e = run!.events[k]!;
    if (e.stage !== stage) { if (e.type === "stage.start" || e.type === "run.start") break; continue; }
    last ??= e.ts;
    if (e.type === "stage.start") break;
    if (recent.length >= limit) continue;
    if (e.type === "agent.tool") recent.push({ ts: e.ts, ...doing(e.data ?? {}), said: false });
    else if (e.type === "agent.message" && e.data?.text) recent.push({ ts: e.ts, verb: "Said", what: clip(String(e.data.text).trim().split("\n")[0]!, 90), said: true });
  }
  // A message newest means the agent is thinking between actions; with nothing yet it is just starting.
  const now: Doing = !recent.length ? { verb: "Starting", what: "" } : recent[0]!.said ? { verb: "Thinking", what: "" } : { verb: recent[0]!.verb, what: recent[0]!.what };
  return { now, last, recent };
}

export type Work = { task: string; stage: string; ts: string; ok: boolean };
/** The last stage each role finished, for the people who are free right now. */
export function lastWork(events: Ev[]): Map<string, Work> {
  const out = new Map<string, Work>();
  for (const e of events) if (e.role && (e.type === "stage.ok" || e.type === "stage.failed")) out.set(e.role, { task: e.task, stage: e.stage, ts: e.ts, ok: e.type === "stage.ok" });
  return out;
}

export type Touched = { path: string; read: number; edited: number; wrote: number; last: string };
/** Which files a person read, edited or wrote in the given events (their tool calls), newest first. */
export function filesTouched(events: Ev[]): Touched[] {
  const by = new Map<string, Touched>();
  for (const e of events) {
    if (e.type !== "agent.tool") continue;
    const tool = e.data?.tool as string | undefined, i = e.data?.input ?? {};
    const kind = tool === "Read" ? "read" : tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit" ? "edited" : tool === "Write" ? "wrote" : null;
    const path = shortPath(i.file_path ?? i.notebook_path);
    if (!kind || !path) continue;
    const t = by.get(path) ?? { path, read: 0, edited: 0, wrote: 0, last: e.ts };
    t[kind]++; t.last = e.ts;
    by.set(path, t);
  }
  return [...by.values()].sort((a, b) => b.last.localeCompare(a.last));
}

export type Stint = { task: string; stage: string; ts: string; ms?: number; cost: number; state: "running" | "ok" | "failed" };
/** One person's recent stages across tasks, newest first: what, when, how long, what it cost, how it ended. */
export function timelineOf(events: Ev[], role: string, limit = 12): Stint[] {
  const open = new Map<string, Stint>(), out: Stint[] = [];
  for (const e of events) {
    if (e.role !== role) continue;
    const key = `${e.run}:${e.stage}`;
    if (e.type === "stage.start") { const s: Stint = { task: e.task, stage: e.stage, ts: e.ts, cost: 0, state: "running" }; open.set(key, s); out.push(s); }
    else if (e.type === "stage.ok" || e.type === "stage.failed" || e.type === "stage.error") {
      const s = open.get(key); if (!s) continue;
      s.ms = Date.parse(e.ts) - Date.parse(s.ts); s.cost = e.data?.usage?.costUsd ?? 0; s.state = e.type === "stage.ok" ? "ok" : "failed";
    }
  }
  return out.reverse().slice(0, limit);
}

/** How full a conversation's context is after its last reply: the tokens the model was sent and wrote, and the model's window. */
export type Context = { used: number; window: number };
/**
 * Reads a conversation's context from Claude's stream. `usage` is the last main-thread assistant message's (what that request read, plus what it wrote,
 * is what the next message starts from); `result` is the final line, whose `modelUsage` gives each model's window.
 */
export function contextOf(last: { model?: string; usage?: Record<string, unknown> } | undefined, result: { modelUsage?: Record<string, { contextWindow?: number }> } | undefined): Context | undefined {
  const u = last?.usage, n = (k: string) => (typeof u?.[k] === "number" ? (u[k] as number) : 0);
  const used = n("input_tokens") + n("cache_read_input_tokens") + n("cache_creation_input_tokens") + n("output_tokens");
  const windows = result?.modelUsage ?? {};
  const window = windows[last?.model ?? ""]?.contextWindow ?? Math.max(0, ...Object.values(windows).map((m) => m.contextWindow ?? 0));
  return used > 0 && window > 0 ? { used, window } : undefined;
}
/** "120k", "1M": a token count short enough for a header. */
export const tokens = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** The commands a conversation's message box takes, as in Claude Code. `args` says what may follow the name. */
export const CHAT_COMMANDS = [
  { name: "compact", args: "[what to keep]", hint: "Keep a summary instead of every message" },
  { name: "clear", args: "", hint: "Delete this conversation and start a new one" },
] as const;
/**
 * The commands to suggest for what is typed after the slash. Loose on purpose: the letters only have to appear in that order ("cmp" and "pact" both find compact),
 * and `*` stands for anything. A name that starts with what was typed comes first, then one that contains it, then the rest.
 */
export function matchCommands<T extends { name: string }>(typed: string, commands: readonly T[]): T[] {
  const q = typed.toLowerCase().replace(/[^a-z*-]/g, "");
  const loose = new RegExp(q.split("").map((c) => (c === "*" ? ".*" : c.replace("-", "\\-"))).join(".*"));
  const rank = (n: string) => (n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2);
  return commands.map((c, i) => ({ c, i })).filter(({ c }) => loose.test(c.name)).sort((a, b) => rank(a.c.name) - rank(b.c.name) || a.i - b.i).map(({ c }) => c);
}

/** A reply that ends with `SUGGEST: …` lines: the reply without them, and up to three short messages the person could send next. */
export function splitSuggestions(text: string): { text: string; suggestions: string[] } {
  const found: string[] = [];
  const rest = text.replace(/^SUGGEST:[ \t]*(.{1,120}?)[ \t]*$/gm, (_, s: string) => { if (found.length < 3 && s.trim()) found.push(s.trim()); return ""; });
  return { text: rest.replace(/\n{3,}/g, "\n\n").trimEnd(), suggestions: found };
}

/** What a conversation can be shown: pictures, PDFs, notebooks and plain text of any kind (the model opens each with its Read tool). No .env, no archives, no programs. */
export const ATTACH_EXT = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "ipynb", "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml", "xml", "html", "css", "svg", "log", "diff", "patch", "sql",
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "cs", "php", "sh", "lua", "dart", "vue", "svelte"];
export const ATTACH_MAX_FILES = 8, ATTACH_MAX_BYTES = 20 * 1024 * 1024;

/** An action a conversation proposes. Only a button the person presses runs it. */
export type Proposal = { kind: "push" | "batch" | "merge" | "sync" | "promote" | "run" | "retry"; ids: string[] };
/** Takes the one `PROPOSE:` line out of a reply. A line that does not fit its kind (a sync names no task, everything else one to eight) is not a proposal, and stays in the text. */
export function parseProposal(text: string): { text: string; proposal?: Proposal } {
  const m = /^PROPOSE: (push|batch|merge|sync|promote|run|retry)((?: (?:F-\d+|batch-\d+(?:-\d+)?))*)[ \t]*$/m.exec(text);
  if (!m) return { text };
  const kind = m[1] as Proposal["kind"], ids = m[2]!.trim() ? m[2]!.trim().split(" ") : [];
  const fits = kind === "sync" ? ids.length === 0 : kind === "batch" ? ids.length >= 2 && ids.length <= 8 && ids.every((i) => i.startsWith("F-")) : kind === "merge" ? ids.length >= 1 && ids.length <= 8 : ids.length >= 1 && ids.length <= 8 && ids.every((i) => i.startsWith("F-"));
  return fits ? { text: text.replace(m[0], "").trimEnd(), proposal: { kind, ids } } : { text };
}
