# Backlog

The factory's intake queue. `factory run` takes the top item under Ready.
Only the orchestrator moves items; people add to Inbox and promote to Ready.

## Inbox
- [ ] F-007 (P1) Phase 7: hardening and Release 1
  Security review, one end-to-end browser test, README.
- [ ] F-008 (P2) Release 2: Codex CLI runner
- [ ] F-009 (P2) Release 2: API key vault in the macOS Keychain
- [ ] F-010 (P2) Release 2: Ollama through a per-role base URL
- [ ] F-011 (P3) Split security review into its own role once the Reviewer measurably misses findings
- [ ] F-012 (P3) Graph view for the pipeline once fan-out outgrows columns
- [ ] F-013 (P3) Multi-repo support once a second repo exists
- [ ] F-014 (P3) Visual workflow editor for skills
- [ ] F-015 (P3) Mid-turn steering if headless CLIs support message injection
- [ ] F-016 Keep the user-level CLAUDE.md out of factory agents (project-only settings still load it)
- [ ] F-017 Consider the CLI's native --fallback-model for overload, alongside the factory's own chain
- [ ] F-018 Budget cap per stage with --max-budget-usd
- [ ] F-019 Run builder stages inside an OS-level sandbox; the guard hook is a text match, not containment
- [ ] F-020 Reject with feedback: send an awaiting-approval task back to Build with a person's comments
- [ ] F-021 Rebase a task branch automatically when approve hits a merge conflict
- [ ] F-022 Pause and resume a running task from the control plane
- [ ] F-023 Model health test in the matrix: a one-token prompt per model
- [ ] F-024 Show a skill's SKILL.md in the studio before installing it, not only its skills.sh page
- [ ] F-025 Assign a local port per task worktree once tasks start dev servers

## Ready

## In progress

## Awaiting approval

## Blocked

## Done
- [x] F-001 (P1) Phase 1: foundation
  Rules files, config validation, event store, pipeline with stub runner, gate, backlog, per-role skills.
- [x] F-002 (P1) Phase 2: Claude runner
  Headless `claude -p --agent` runner isolated to project settings, result classification, failover, per-role permission modes, attached skills.
- [x] F-003 (P1) Phase 3: worktrees, parallel builders, hooks, guard
  One git worktree per task, parallel runs, guard and gate hooks, backlog-only commits, approve and discard.
- [x] F-004 (P1) Phase 4: server
  Streaming runner with live tool-call and rate-limit events, event stream with replay, run, stop, approve, discard and add endpoints.
- [x] F-005 (P1) Phase 5: GUI first tier
  Backlog and pipeline board, live log, spec, review and diff panel with approve and discard, model matrix, usage gauge.
- [x] F-006 (P1) Phase 6: GUI second tier
  Cost and pass rate by model, role and task; run replay; worktree manager; studio with versioned editing and per-role skills; graph viewer.
