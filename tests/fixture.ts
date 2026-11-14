// Shared by the unit tests and the browser end-to-end test: a throwaway factory repo.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "../plugin/engine/backlog";
import type { Config } from "../plugin/engine/config";

export const role = { runner: "claude", model: "sonnet", effort: "medium", fallback: ["haiku"] };
export const config: Config = { gate: ["true"], roles: { planner: role, architect: role, builder: role, reviewer: role, scribe: role, "security-performance": role } };
export const BACKLOG = "# Backlog\n\n## Inbox\n\n## Ready\n- [ ] F-001 (P1) First\n  detail line\n- [ ] F-002 Second\n\n## In progress\n\n## Awaiting approval\n\n## Blocked\n\n## Done\n";
export const tmp = () => mkdtempSync(join(tmpdir(), "factory-"));

// Commits made in throwaway repos must not depend on the machine's git identity, and tests must not run graphify.
Object.assign(process.env, { FACTORY_NO_GRAPH: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" });

/** A git repo with two Ready items, one role file, one installed skill and a gate that always passes. */
export function repo() {
  const dir = tmp();
  const sh = (...argv: string[]) => {
    const p = Bun.spawnSync(argv, { cwd: dir, env: process.env }); // explicit: Bun does not pass later changes to process.env to children
    return { code: p.exitCode, out: `${p.stdout}${p.stderr}`.trim() };
  };
  writeFileSync(join(dir, "BACKLOG.md"), BACKLOG);
  writeFileSync(join(dir, "factory.config.json"), JSON.stringify({ ...config, setup: ["true"] }));
  writeFileSync(join(dir, ".gitignore"), ".factory/\n.worktrees/\n");
  mkdirSync(join(dir, ".claude/agents"), { recursive: true });
  mkdirSync(join(dir, ".claude/skills/tdd"), { recursive: true });
  writeFileSync(join(dir, ".claude/agents/builder.md"), "---\nname: builder\ntools: Read\n---\nBuild it.\n");
  writeFileSync(join(dir, ".claude/skills/tdd/SKILL.md"), "---\nname: tdd\n---\nTest first.\n");
  writeFileSync(join(dir, "AGENTS.md"), "# Rules\n");
  sh("git", "init", "-q", "-b", "main"); sh("git", "add", "-A"); sh("git", "commit", "-q", "-m", "base");
  const section = (id: string) => parse(readFileSync(join(dir, "BACKLOG.md"), "utf8")).find((i) => i.id === id)?.section;
  return { dir, sh, section, cli: (...args: string[]) => sh(join(import.meta.dir, "../plugin/bin/factory"), ...args) };
}

/** A stand-in for the GitHub CLI: signed in, opens pull request #7, lists the pull requests you give it, and logs every call. Point FACTORY_GH at `.path`. */
export function fakeGh() {
  const dir = tmp(), path = join(dir, "gh");
  writeFileSync(path, `#!/bin/bash
D="$(dirname "$0")"
echo "$@" >> "$D/calls.log"
case "$1 $2" in
  "auth status") exit 0;;
  "pr create") echo "https://github.com/o/r/pull/7"; exit 0;;
  "pr list") cat "$D/prs.json" 2>/dev/null || echo "[]"; exit 0;;
esac
exit 0
`);
  chmodSync(path, 0o755);
  return {
    path,
    calls: () => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : ""),
    prs: (list: object[]) => writeFileSync(join(dir, "prs.json"), JSON.stringify(list)),
  };
}

/** One pull request as `gh pr list --json` reports it, with a single check that ended as `conclusion`. */
export const ghPr = (number: number, id: string, conclusion: string, state = "OPEN") =>
  ({ number, url: `https://github.com/o/r/pull/${number}`, state, headRefName: `factory/${id}`, mergeable: "MERGEABLE", statusCheckRollup: [{ status: "COMPLETED", conclusion }] });

/** Fills a throwaway repo with every state the Backlog and Overview show: a running task, a quiet one, a blocked one, one waiting for you with a real diff, one done and some queued. */
export function seedStates(dir: string, cli: (...args: string[]) => unknown) {
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const { move } = require("../plugin/engine/backlog") as typeof import("../plugin/engine/backlog");
  cli("run", "F-001", "--stub"); cli("approve", "F-001"); // done
  for (const t of ["Weekly sales summary", "Customer emails", "Order status page"]) cli("add", t, "--priority", "P1");
  cli("add", "Print a pick list", "--priority", "P2"); // stays in Inbox
  cli("add", "Deposit payment link", "--priority", "P1", "--detail", "Customers pay a deposit.");
  for (const id of ["F-003", "F-004", "F-005", "F-007"]) cli("promote", id);
  cli("run", "F-005", "--stub"); // waiting for you, with a real branch
  writeFileSync(join(dir, "other.txt"), "main moved on\n"); // after F-005 was built: it shows "Main moved on"
  Bun.spawnSync(["git", "add", "other.txt"], { cwd: dir, env: process.env }); Bun.spawnSync(["git", "commit", "-q", "-m", "main moves on"], { cwd: dir, env: process.env });
  const file = join(dir, "BACKLOG.md");
  let text = readFileSync(file, "utf8");
  for (const [id, to] of [["F-002", "In progress"], ["F-003", "In progress"], ["F-004", "Blocked"]] as const) text = move(text, id, to);
  writeFileSync(file, text);
  const db = new Database(join(dir, ".factory/events.db"));
  const add = (ago: number, run: string, task: string, stage: string, type: string, role?: string, model?: string, data?: unknown) =>
    db.query("INSERT INTO events (ts, run, task, stage, type, role, model, data) VALUES (?,?,?,?,?,?,?,?)").run(new Date(Date.now() - ago * 1000).toISOString(), run, task, stage, type, role ?? null, model ?? null, data === undefined ? null : JSON.stringify(data));
  const w = (p: string) => `${dir}/.worktrees/F-002/${p}`;
  const tool = (ago: number, name: string, input: unknown) => add(ago, "rb", "F-002", "build", "agent.tool", "builder", "sonnet", { tool: name, input });
  add(300, "rb", "F-002", "run", "run.start"); add(298, "rb", "F-002", "spec", "stage.start", "architect", "opus");
  add(240, "rb", "F-002", "spec", "stage.ok", "architect", "opus", { output: "# Spec\n\nFilter orders.", usage: { costUsd: 0.18, turns: 5 } }); add(238, "rb", "F-002", "build", "stage.start", "builder", "sonnet");
  tool(200, "Read", { file_path: w("spec.md") }); tool(90, "Edit", { file_path: w("src/helpers.ts") });
  add(70, "rb", "F-002", "build", "agent.message", "builder", "sonnet", { text: "The filter needs a test first." }); tool(10, "Bash", { command: "bun test" });
  add(700, "rr", "F-003", "run", "run.start"); add(680, "rr", "F-003", "build", "stage.start", "builder", "sonnet"); add(500, "rr", "F-003", "build", "stage.ok", "builder", "sonnet", { output: "built", usage: { costUsd: 0.2, turns: 6 } });
  add(480, "rr", "F-003", "review", "stage.start", "reviewer", "opus"); add(300, "rr", "F-003", "review", "agent.tool", "reviewer", "opus", { tool: "Read", input: { file_path: "build.md" } }); // quiet for five minutes
  add(900, "rx", "F-004", "run", "run.start"); add(880, "rx", "F-004", "build", "stage.start", "builder", "sonnet"); add(700, "rx", "F-004", "build", "stage.ok", "builder", "sonnet", { output: "built", usage: { costUsd: 0.3, turns: 8 } });
  add(690, "rx", "F-004", "check", "stage.start"); add(650, "rx", "F-004", "check", "stage.failed", undefined, undefined, "2 tests fail"); add(649, "rx", "F-004", "run", "run.failed", undefined, undefined, "check failed: 2 tests fail");
  db.close();
}
