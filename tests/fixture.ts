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
