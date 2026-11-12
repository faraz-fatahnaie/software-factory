# Backlog

The factory's intake queue. `factory run` takes the top item under Ready.
Only the orchestrator moves items; people add to Inbox and promote to Ready.

## Inbox
- [ ] F-002 (P1) Phase 2: Claude runner
  Headless `claude -p` runner, exit classification, failover between Claude models, spike of unverified headless flags.
- [ ] F-003 (P1) Phase 3: worktrees, parallel builders, hooks, guard
  One git worktree per task, gate as a Stop hook, PreToolUse guard, backlog-only commits, PR stage behind approval.
- [ ] F-004 (P1) Phase 4: server
  Bun.serve on 127.0.0.1:4400, event ingest, server-sent event stream, control endpoints.
- [ ] F-005 (P1) Phase 5: GUI first tier
  Backlog and pipeline columns, logs, approval gates, model matrix.
- [ ] F-006 (P1) Phase 6: GUI second tier
  Cost, replay, worktree manager, studio with per-role skill search, attach and detach.
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

## Ready

## In progress

## Blocked

## Done
- [x] F-001 (P1) Phase 1: foundation
  Rules files, config validation, event store, pipeline with stub runner, gate, backlog, per-role skills.
