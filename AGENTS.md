# Software Factory

A pipeline that takes items from `BACKLOG.md` through Triage → Spec → Build → Check → Review,
with a control-plane GUI to follow. This file is the single rules file for every agent and
model working here; `CLAUDE.md` only imports it.

## Commands

- `bun test` and `bun run typecheck` — the gate. Both must pass before any stage is done.
- `bun run factory run [F-id]` — run the top Ready backlog item, or a specific one.
- `bun run factory add "<title>"` — add an item to Inbox.
- `bun run factory skill add <owner/repo@skill> --role <role>` — install a skill for one role.

## Layout

- `factory/` — orchestrator: `config`, `events` (SQLite log), `backlog`, `pipeline`, `skills`, `cli`.
- `factory.config.json` — model, effort and fallback chain per role. It owns model choice; agent files do not set `model`.
- `.claude/agents/<role>.md` — role prompt, tools and skills.
- `.factory/` — run artifacts and `events.db`. Not committed.
- `graphify-out/` — knowledge graph of this repo.

## Rules

1. **Graph first.** Read `graphify-out/GRAPH_REPORT.md` or run `graphify query "<question>"` before opening source files.
2. **Files are the handoff.** Each run has a directory under `.factory/runs/` holding `task.md`, `triage.md`, `spec.md`, `build.md`, `review.md`. Read what earlier stages wrote; do not assume shared memory with another model.
3. **Never edit `BACKLOG.md`.** Only the orchestrator writes it. If you find work outside your task, end your output with a `## Follow-ups` heading and one `- ` line per item; it goes to Inbox for a person to promote.
4. **Stay in scope.** Do the task in `task.md` and nothing else.
5. **Least code that works.** Reuse what is in this repo, then the standard library, then the platform, then an installed dependency. No new dependency for what a few lines do. No abstractions, config or scaffolding for needs that do not exist yet.
6. **Never cut:** input validation at trust boundaries, error handling that prevents data loss, security checks, tests for non-trivial logic.
7. **No secrets in files.** Config holds environment variable names, never key values.
8. **Bun only.** Use `bun`, `bun test` and `bun:sqlite`; do not add Node-only tooling.
