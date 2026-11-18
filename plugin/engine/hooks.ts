#!/usr/bin/env bun
// Claude Code hook handlers, wired in by the runner (see claude.ts). They run from the
// orchestrator's checkout, never from the task's worktree, so an agent cannot edit them.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { shellGate } from "./pipeline";

type HookInput = {
  cwd?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; command?: string };
  stop_hook_active?: boolean;
};

// Governance files: only people and the orchestrator change these. The rules files are on the
// list because every later stage of the same task reads them: a builder that could edit
// AGENTS.md could tell its own reviewer to approve. graphify-out is on it because the GUI
// displays graph.html.
const PROTECTED = /(^|\/)(BACKLOG\.md|CONSTRAINTS\.md|factory\.config\.json|AGENTS\.md|CLAUDE(\.local)?\.md)$|(^|\/)(\.(claude|git|factory)|graphify-out)(\/|$)/;
// ponytail: a text match on the command, not a shell parser. It stops accidents and plain
// attempts; real containment needs an OS-level sandbox (queued in BACKLOG.md).
const PROTECTED_IN_COMMAND = /BACKLOG\.md|CONSTRAINTS\.md|factory\.config\.json|AGENTS\.md|CLAUDE(\.local)?\.md|graphify-out|(^|[\s"'=\/])\.(claude|git|factory)(?![\w-])/;
const OUTWARD = /\bgit\s+push\b|\bgh\s+pr\s+(create|merge)\b/;

/** Resolves symlinks through the deepest existing ancestor, so not-yet-created files work too. */
function real(path: string): string {
  let dir = path, rest = "";
  while (!existsSync(dir)) {
    rest = join(basename(dir), rest);
    dir = dirname(dir);
  }
  return join(realpathSync(dir), rest);
}

/** Why a tool call must be blocked, or null to leave it to the permission system. */
export function guard(i: HookInput, root: string): string | null {
  const file = i.tool_input?.file_path ?? i.tool_input?.notebook_path;
  if (["Edit", "Write", "NotebookEdit"].includes(i.tool_name ?? "") && file) {
    // Compare real paths: /var and /private/var are the same place on macOS, and a
    // symlink inside the worktree must not be a way out of it.
    const base = real(root);
    const rel = relative(base, real(resolve(base, file)));
    if (rel.startsWith("..") || isAbsolute(rel)) return `${file} is outside this task's working directory`;
    if (PROTECTED.test(rel))
      return `${rel} is a governance file that only people and the orchestrator change. List the change under "## Follow-ups" instead`;
  }
  const command = i.tool_name === "Bash" ? i.tool_input?.command : undefined;
  if (command) {
    if (OUTWARD.test(command)) return "pushing and opening pull requests is the orchestrator's job, after human approval";
    // Only a role that may write (the builder) can reach these paths through the shell.
    if (i.permission_mode === "acceptEdits" && PROTECTED_IN_COMMAND.test(command))
      return "shell commands must not touch the governance files (BACKLOG.md, CONSTRAINTS.md, factory.config.json, AGENTS.md, CLAUDE.md, .claude, .git, .factory, graphify-out). Use the Read tool to read them";
  }
  return null;
}

if (import.meta.main) {
  const mode = process.argv[2];
  try {
    const input: HookInput = JSON.parse(await Bun.stdin.text());
    const root = process.env.FACTORY_ROOT ?? input.cwd ?? process.cwd();
    if (mode === "guard") {
      const why = guard(input, root);
      if (why) {
        console.error(`Blocked by the factory guard: ${why}.`);
        process.exit(2);
      }
    } else if (mode === "stop" && !input.stop_hook_active) {
      // Sends the builder back once per turn; after that the orchestrator's own gate decides.
      const gate = await shellGate(JSON.parse(process.env.FACTORY_GATE ?? "[]"))(root);
      if (!gate.ok) {
        console.error(`The gate failed. Fix it before you finish.\n${gate.output}`);
        process.exit(2);
      }
    }
  } catch (e) {
    // Fail closed: a guard that cannot read its input blocks the call.
    console.error(`factory ${mode} hook failed: ${e}`);
    process.exit(mode === "guard" ? 2 : 1);
  }
}
