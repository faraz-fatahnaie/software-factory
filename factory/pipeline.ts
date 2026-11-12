import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config, Role } from "./config";
import type { Store } from "./events";

export type Status = "ok" | "rate_limited" | "auth" | "error";
export type Job = { role: Role; model: string; effort: string; stage: string; prompt: string; cwd: string };
export type RunnerResult = { status: Status; text: string; usage?: unknown };
export type Runner = (job: Job) => Promise<RunnerResult>;
export type Gate = (cwd: string) => Promise<{ ok: boolean; output: string }>;

const MAX_BUILDS = 3;

/** Deterministic checks (lint, types, tests). Same gate whichever model wrote the code. */
export function shellGate(cmds: string[]): Gate {
  return async (cwd) => {
    for (const cmd of cmds) {
      // Async, so parallel tasks keep moving while one task's checks run.
      const p = Bun.spawn(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      // Keep only the tail: it is fed back to the builder as a prompt.
      if (code !== 0) return { ok: false, output: `$ ${cmd}\n${out}${err}`.slice(-4000) };
    }
    return { ok: true, output: "" };
  };
}

/** Canned runner for `factory run --stub` and tests: exercises the pipeline without a model. */
export const stubRunner: Runner = async ({ stage, cwd }) => {
  if (stage === "build") writeFileSync(join(cwd, "STUB_BUILD.txt"), `stub build ${new Date().toISOString()}\n`);
  return { status: "ok", text: stage === "review" ? "APPROVE\n\nStub review." : `Stub ${stage} output.` };
};

/** Lines under a "## Follow-ups" heading: out-of-scope work an agent wants queued. */
export function followUps(text: string): string[] {
  const body = text.split(/^## Follow-ups\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...body.matchAll(/^- (.+)$/gm)].map((m) => m[1]!);
}

/** Triage → Spec → Build → Check → Review, looping Build on gate or review failure. */
export async function runTask(
  task: { id: string; title: string },
  o: { config: Config; store: Store; runner: Runner; gate: Gate; cwd: string },
) {
  const run = crypto.randomUUID().slice(0, 8);
  const dir = join(o.cwd, ".factory", "runs", run);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "task.md"), `# ${task.id} ${task.title}\n`);
  const emit = (stage: string, type: string, extra: { role?: Role; model?: string; data?: unknown } = {}) =>
    o.store.emit({ run, task: task.id, stage, type, ...extra });

  // One model stage. Only a rate limit moves down the fallback chain:
  // retrying an auth or generic error on another model would hide the fault.
  const stage = async (name: string, role: Role, feedback = "") => {
    const r = o.config.roles[role];
    for (const model of [r.model, ...r.fallback]) {
      emit(name, "stage.start", { role, model });
      const prompt =
        `Stage: ${name}. The task and earlier stage outputs are in ${dir}. Read them first.` +
        (feedback && `\n\nAddress this feedback:\n${feedback}`);
      const res = await o.runner({ role, model, effort: r.effort, stage: name, prompt, cwd: o.cwd });
      const error = res.status === "ok" ? undefined : res.text.slice(0, 500);
      // The output is logged too: files hold only the latest attempt, the log holds every one.
      emit(name, `stage.${res.status}`, { role, model, data: { usage: res.usage, error, output: error ? undefined : res.text } });
      if (res.status === "ok") {
        writeFileSync(join(dir, `${name}.md`), res.text);
        return res.text;
      }
      if (res.status !== "rate_limited") throw new Error(`${name} failed on ${model}: ${res.status}: ${error}`);
    }
    throw new Error(`${name}: every model in the ${role} chain is rate limited`);
  };

  try {
    emit("run", "run.start");
    await stage("triage", "triage");
    await stage("spec", "architect");
    let feedback = "";
    for (let attempt = 1; ; attempt++) {
      const build = await stage("build", "builder", feedback);
      emit("check", "stage.start");
      const check = await o.gate(o.cwd);
      emit("check", check.ok ? "stage.ok" : "stage.failed", { data: check.output });
      const review = check.ok ? await stage("review", "reviewer") : "";
      // Anything other than a leading APPROVE counts as changes requested.
      if (/^APPROVE\b/.test(review)) {
        emit("run", "run.done");
        return { ok: true as const, run, followUps: [...followUps(build), ...followUps(review)] };
      }
      if (attempt === MAX_BUILDS) throw new Error(`no approved build after ${MAX_BUILDS} attempts`);
      feedback = check.ok ? review : check.output;
    }
  } catch (e) {
    emit("run", "run.failed", { data: String(e) });
    return { ok: false as const, run, error: String(e), followUps: [] as string[] };
  }
}
