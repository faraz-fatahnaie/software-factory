// Shared by the unit tests and the browser end-to-end test: a throwaway factory repo.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "../plugin/engine/backlog";
import type { Config } from "../plugin/engine/config";

export const role = { runner: "claude", model: "sonnet", effort: "medium", fallback: ["haiku"] };
export const config: Config = { gate: ["true"], roles: { triage: role, architect: role, builder: role, reviewer: role } };
export const BACKLOG = "# Backlog\n\n## Inbox\n\n## Ready\n- [ ] F-001 (P1) First\n  detail line\n- [ ] F-002 Second\n\n## In progress\n\n## Awaiting approval\n\n## Blocked\n\n## Done\n";
export const tmp = () => mkdtempSync(join(tmpdir(), "factory-"));

// Commits made in throwaway repos must not depend on the machine's git identity.
Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" });

/** A git repo with two Ready items, one role file, one installed skill and a gate that always passes. */
export function repo() {
  const dir = tmp();
  const sh = (...argv: string[]) => {
    const p = Bun.spawnSync(argv, { cwd: dir });
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
