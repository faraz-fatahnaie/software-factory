# Software Factory

A pipeline that takes items from `BACKLOG.md` through Triage → Spec → Build → Check → Review,
with a control-plane GUI to follow. This file is the single rules file for every agent and
model working here; `CLAUDE.md` only imports it.

## Commands

- `bun test` and `bun run typecheck` — the gate. Both must pass before any stage is done.
- `bun run e2e` — browser end-to-end test of the GUI with dry runs. Needs Chrome; not part of the gate.
- `bun run factory run [F-id...] [--parallel N] [--stub]` — run the top Ready item(s) or the named ones, each in its own worktree. `--stub` makes no model calls.
- `bun run factory approve <F-id>` / `discard <F-id>` — a person accepts or throws away a finished task. With a GitHub `origin`, approving keeps the branch and pushes nothing.
- `bun run factory push <F-id>` / `merge <F-id>` / `sync` / `vcs [auto-merge on|off]` — GitHub, only on request: push an approved task and open its pull request (secret scan first), merge it (refuses failing checks), update from GitHub, show what is waiting. Auto-merge is off unless a person turns it on, and needs a workflow to wait for.
- `bun run factory serve [port]` — local control plane on `127.0.0.1:4400`: the GUI (overview, backlog, talk, checks, team, agents, logs, worktrees, studio, graph), a live event stream, and the endpoints behind them. Studio saves commit the edited file.
- `bun run factory add "<title>"` — add an item to Inbox.
- `bun run factory skill add <owner/repo@skill> --role <role>` — install a skill for one role. `skill attach|detach <skill> --role <role>` for one already installed. Each is committed, because task worktrees branch from HEAD.

## Layout

- `plugin/` — **the product**, and the only folder users receive. Read `docs/PLUGIN.md` before changing its layout, adding a dependency or releasing.
- `plugin/engine/` — orchestrator: `config`, `events` (SQLite log), `backlog`, `pipeline`, `claude` (headless runner), `worktree`, `hooks` (guard and gate), `server`, `skills`, `cli`.
- `gui/` — source of the control plane page (React, plain CSS): `data.ts` holds the hooks (event stream, polled backlog, theme), `app.tsx` the shell, Overview and Backlog, `views.tsx` the Agents, Logs, Worktrees and Studio views, `team.tsx` the Team view, `talk.tsx` the Talk and Checks views, `vcs.tsx` the GitHub tile and rail chip, `icons.tsx` the inline icons, `robots.tsx` the twelve robot avatars (one per role; `personaFor` gives a role its robot and name, a made-up role gets one by its name), `ui.tsx` the dropdown that replaces the browser's menu (`Select`, in a portal, keyboard-driven) and the skeleton placeholders. Do not use a native `<select>`. It is built into `plugin/dist/`, which is committed. `plugin/engine/state.ts` folds the event log into what the page and `factory status` show.
- `plugin/skills/` — the slash commands (`/software-factory:init`, `git`, `add`, `run`, `status`, `open`, `approve`, `discard`, `doctor`). Each is a thin wrapper over `factory`; put logic in the engine.
- `plugin/templates/catalog.json`, `presets.json` — the responsibility catalog and the team presets (see `docs/ROLES.md`); `plugin/engine/chronicle.ts` parses the Scribe's reply and appends the chronicle and role notes when a task is approved; `plugin/engine/graph.ts` runs graphify. `plugin/engine/teamctl.ts` changes a project's team (checked against the rules, config and role files updated together). `plugin/engine/vcs.ts` is the deterministic side of git and GitHub (status, push, pull request, merge, sync); the Release Engineer holds it (G1 setup, G2 what is waiting). It talks to GitHub only through `gh` (`FACTORY_GH` overrides it in tests), never pushes or merges unprompted, and the GUI chat can only propose a push (a `PROPOSE:` line the page turns into a button). `plugin/engine/release.ts` is the deterministic side of releasing (version files, readiness checks, the commit-and-tag step); it never pushes or deploys. `plugin/engine/estimate.ts` estimates what a task costs for a team (observed stage costs, else a per-model guide); `plugin/engine/chat.ts` runs the GUI's conversations (documents only, no deploy); `teamctl.ts` also builds the Team view data and previews a change (`planTeam`) without writing. `plugin/engine/security.ts` is the deterministic security gate: change-set parsing, the secret scan and the sensitive-area triggers. `plugin/engine/team.ts` validates a team and assembles role files (unattended roles) and chat prompts (`factory role`, used by the brainstorm, research and plan skills) from it. A project's team is a preset in `presets.json` plus its own changes under `team` in the config (`resolveTeam`); pipeline stages find their role by who holds the stage's responsibility. Skills name responsibilities (`factory role D1 D3`), never roles. A catalog entry's `how` decides which: `chat` runs in the user's session, `headless` is an agent stage. Add a responsibility's `instruction` to the catalog to make it real.
- `plugin/templates/` — rules and backlog that init writes into a project (role files and config come from the catalog). `plugin/bin/factory` is the executable.
- `tests/` — unit and HTTP tests. `e2e/` — the browser test. `tests/fixture.ts` builds the throwaway repo both test suites use.
- `.worktrees/<F-id>/` — one git worktree and `factory/<F-id>` branch per task. Not committed.
- `factory.config.json` — model, effort and fallback chain per role. It owns model choice; agent files do not set `model`.
- `.claude/agents/<role>.md` — role prompt, tools and skills. Each stage runs as `claude -p --agent <role>` with project settings only; only the builder may change files.
- `.factory/` — run artifacts and `events.db`. Not committed.
- `graphify-out/` — knowledge graph of this repo.

## Rules

1. **Graph first.** Read `graphify-out/GRAPH_REPORT.md` or run `graphify query "<question>"` before opening source files.
2. **Files are the handoff.** Each run has a directory under `.factory/runs/` holding `task.md`, `triage.md` (only for ad-hoc items), `spec.md`, `build.md`, `review.md`. Read what earlier stages wrote; do not assume shared memory with another model. Your final reply is your stage's output: the orchestrator saves it, so do not write into `.factory/` yourself.
3. **Never edit governance files:** `BACKLOG.md`, `factory.config.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.git`, `.factory/`, `graphify-out/`. A guard hook blocks it. Never commit, push or open pull requests; the orchestrator does that after a person approves. If you find work outside your task, end your output with a `## Follow-ups` heading and one `- ` line per item; it goes to Inbox for a person to promote.
4. **Stay in scope.** Do the task in `task.md` and nothing else.
5. **Least code that works.** Reuse what is in this repo, then the standard library, then the platform, then an installed dependency. No new dependency for what a few lines do. No abstractions, config or scaffolding for needs that do not exist yet.
6. **Never cut:** input validation at trust boundaries, error handling that prevents data loss, security checks, tests for non-trivial logic.
7. **No secrets in files.** Config holds environment variable names, never key values.
8. **Product and development stay apart.** Anything the product needs at runtime lives in `plugin/`; tests, dev skills and this repo's own backlog, config and role files never go there. The factory is not used to develop itself.
9. **Bun only.** Use `bun`, `bun test` and `bun:sqlite`; do not add Node-only tooling.
