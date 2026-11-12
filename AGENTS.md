# Software Factory

A pipeline that takes items from `BACKLOG.md` through Triage → Spec → Build → Check → Review,
with a control-plane GUI to follow. This file is the single rules file for every agent and
model working here; `CLAUDE.md` only imports it.

## Commands

- `bun test` and `bun run typecheck` — the gate. Both must pass before any stage is done.
- `bun run factory run [F-id...] [--parallel N] [--stub]` — run the top Ready item(s) or the named ones, each in its own worktree. `--stub` makes no model calls.
- `bun run factory approve <F-id>` / `discard <F-id>` — a person lands or throws away a finished task.
- `bun run factory serve [port]` — local control plane on `127.0.0.1:4400`: the GUI, a live event stream, and run, stop, approve, discard, promote, add and model-config endpoints.
- `bun run factory add "<title>"` — add an item to Inbox.
- `bun run factory skill add <owner/repo@skill> --role <role>` — install a skill for one role.

## Layout

- `factory/` — orchestrator: `config`, `events` (SQLite log), `backlog`, `pipeline`, `claude` (headless runner), `worktree`, `hooks` (guard and gate), `server`, `skills`, `cli`.
- `gui/` — the control plane page (React, bundled by Bun on request): `state.ts` folds the event log into what the page shows, `app.tsx` renders it.
- `.worktrees/<F-id>/` — one git worktree and `factory/<F-id>` branch per task. Not committed.
- `factory.config.json` — model, effort and fallback chain per role. It owns model choice; agent files do not set `model`.
- `.claude/agents/<role>.md` — role prompt, tools and skills. Each stage runs as `claude -p --agent <role>` with project settings only; only the builder may change files.
- `.factory/` — run artifacts and `events.db`. Not committed.
- `graphify-out/` — knowledge graph of this repo.

## Rules

1. **Graph first.** Read `graphify-out/GRAPH_REPORT.md` or run `graphify query "<question>"` before opening source files.
2. **Files are the handoff.** Each run has a directory under `.factory/runs/` holding `task.md`, `triage.md`, `spec.md`, `build.md`, `review.md`. Read what earlier stages wrote; do not assume shared memory with another model. Your final reply is your stage's output: the orchestrator saves it, so do not write into `.factory/` yourself.
3. **Never edit governance files:** `BACKLOG.md`, `factory.config.json`, `.claude/`, `.git`, `.factory/`. A guard hook blocks it. Never commit, push or open pull requests; the orchestrator does that after a person approves. If you find work outside your task, end your output with a `## Follow-ups` heading and one `- ` line per item; it goes to Inbox for a person to promote.
4. **Stay in scope.** Do the task in `task.md` and nothing else.
5. **Least code that works.** Reuse what is in this repo, then the standard library, then the platform, then an installed dependency. No new dependency for what a few lines do. No abstractions, config or scaffolding for needs that do not exist yet.
6. **Never cut:** input validation at trust boundaries, error handling that prevents data loss, security checks, tests for non-trivial logic.
7. **No secrets in files.** Config holds environment variable names, never key values.
8. **Bun only.** Use `bun`, `bun test` and `bun:sqlite`; do not add Node-only tooling.
