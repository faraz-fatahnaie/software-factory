// `bun run evals:roles [--model haiku] [--case <id>] [--runs N] [--dry-run]`: the roles' behaviour evals (F-116). Spends tokens: one model stage per
// case and run, on the model given (haiku by default, at low effort). The cases and why they are graded the way they are: evals/roles/cases.ts.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeRunner } from "../plugin/engine/claude";
import { parseConfig } from "../plugin/engine/config";
import { openStore } from "../plugin/engine/events";
import { runTask, shellGate, type Runner } from "../plugin/engine/pipeline";
import { activeRoles, DEFAULT_PRESET, renderRole, resolveTeam } from "../plugin/engine/team";
import { CASES, FIXTURE, GATE, type Case, type Outcome, type Script } from "./roles/cases";

const sh = (cwd: string, ...argv: string[]) => Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });

/** A throwaway project: the shop fixture, the factory's config and the role files the catalog makes today, committed. */
export function project(c: Case, model?: string): string {
  const dir = mkdtempSync(join(tmpdir(), `eval-${c.id}-`));
  for (const [file, text] of Object.entries(FIXTURE)) { mkdirSync(join(dir, file, ".."), { recursive: true }); writeFileSync(join(dir, file), text); }
  c.setup?.(dir);
  const team = resolveTeam({ preset: DEFAULT_PRESET });
  const roles = Object.fromEntries(activeRoles(team).map((r) => [r, { runner: "claude", ...team.roles[r]!.defaults!, ...(model && { model, effort: "low", fallback: [] }) }]));
  writeFileSync(join(dir, "factory.config.json"), JSON.stringify(parseConfig({ setup: [], gate: GATE, graph: false, team: { preset: DEFAULT_PRESET }, roles }), null, 2));
  mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
  for (const r of activeRoles(team)) writeFileSync(join(dir, ".claude", "agents", `${r}.md`), renderRole(r, team));
  writeFileSync(join(dir, "AGENTS.md"), readFileSync(join(import.meta.dir, "../plugin/templates/RULES.md"), "utf8"));
  writeFileSync(join(dir, ".gitignore"), ".factory/\n");
  sh(dir, "git", "init", "-q", "-b", "main"); sh(dir, "git", "add", "-A"); sh(dir, "git", "-c", "user.name=eval", "-c", "user.email=eval@localhost", "commit", "-q", "-m", "base");
  return dir;
}

/** Runs one case: the stage under test by `stage` (a model, or a script), the others scripted. */
export async function runCase(c: Case, stage: Script | { model: string }): Promise<Outcome & { cost: number }> {
  const model = "model" in stage ? stage.model : undefined;
  const dir = project(c, model);
  const config = parseConfig(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")));
  const real = model ? claudeRunner(GATE) : undefined;
  const outputs: Record<string, string> = {};
  const scripted = (s: Script, cwd: string) => { s.write?.(cwd); return { status: "ok" as const, text: s.text }; };
  const runner: Runner = async (job) => {
    const res = job.stage === c.stage ? (real ? await real(job) : scripted(stage as Script, job.cwd))
      : job.stage === "spec" ? { status: "ok" as const, text: c.spec ?? "# Spec\n\nRisk: none" }
      : job.stage === "build" ? (c.build ? scripted(c.build, job.cwd) : (writeFileSync(join(job.cwd, "NOTES.txt"), "built\n"), { status: "ok" as const, text: "Built." }))
      : job.stage === "review" || job.stage === "doubt" ? { status: "ok" as const, text: "APPROVE\nFine." }
      : job.stage === "security" ? { status: "ok" as const, text: "SECURE" }
      : { status: "ok" as const, text: job.stage === "document" ? "## Chronicle\nDone." : "x" };
    if (res.status === "ok") outputs[job.stage] = res.text;
    return res;
  };
  const store = openStore(":memory:");
  const r = await runTask({ id: "F-001", ...c.task }, { config, store, runner, gate: shellGate(GATE), cwd: dir });
  const events = store.list(r.run) as Outcome["events"];
  const cost = events.reduce((n, e) => n + (((e.data as any)?.usage?.costUsd as number) ?? 0), 0);
  return { ok: r.ok, error: r.ok ? "" : r.error, cwd: dir, outputs, events, cost };
}

if (import.meta.main) {
  const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
  const model = opt("--model") ?? "haiku", runs = Number(opt("--runs") ?? 1), only = opt("--case");
  const chosen = CASES.filter((c) => !only || c.id === only);
  if (!chosen.length) throw new Error(`no case ${only}; the cases are: ${CASES.map((c) => c.id).join(", ")}`);
  if (args.includes("--dry-run")) {
    for (const c of chosen) console.log(`${c.id.padEnd(26)} ${c.role.padEnd(9)} ${c.stage.padEnd(6)} ${c.pressure}`);
    console.log(`\n${chosen.length * runs} model stage(s) on ${model}, nothing spent yet.`);
    process.exit(0);
  }
  let failed = 0, spent = 0;
  const results: unknown[] = [];
  for (const c of chosen) for (let i = 1; i <= runs; i++) {
    const o = await runCase(c, { model });
    const why = c.grade(o);
    spent += o.cost; if (why) failed++;
    results.push({ case: c.id, run: i, pass: !why, why, cost: o.cost, error: o.error, output: o.outputs[c.stage] });
    console.log(`${why ? "✗" : "✓"} ${c.id}${runs > 1 ? ` (${i}/${runs})` : ""}  $${o.cost.toFixed(3)}${why ? `\n    ${why}` : ""}`);
  }
  mkdirSync(join(import.meta.dir, "results"), { recursive: true });
  const file = join(import.meta.dir, "results", `roles-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ model, results }, null, 2));
  console.log(`\n${results.length - failed}/${results.length} passed on ${model} · $${spent.toFixed(2)} · ${file}`);
  process.exit(failed ? 1 : 0);
}
