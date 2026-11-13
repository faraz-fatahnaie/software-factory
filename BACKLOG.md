# Backlog

The factory's intake queue. `factory run` takes the top item under Ready.
Only the orchestrator moves items; people add to Inbox and promote to Ready.

## Inbox
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

- [ ] F-027 (P1) Multi-project view at user scope
  Project registry in the plugin data folder; project switcher in the GUI.
- [ ] F-032 (P2) Dashboard design refactor
  The Phase 10 design works but can be improved; revisit with the user's notes.
- [ ] F-033 (P2) Spending caps per role with dynamic model switching
  When a role reaches its cap or a usage limit, keep working on another model instead of stopping. Deferred by the user on 2026-11-13.
- [ ] F-034 (P2) Default skills per role
  The user will supply the skill sets for each role; until then roles ship with the existing defaults only.
- [ ] F-028 (P1) Phase 11: brainstorming role
  A role that works out with the user what to build, for projects in any language. Design to be agreed first.
- [ ] F-029 (P1) Phase 12: publish
  Public GitHub repository, install docs, real owner and author in the manifests, version bump and tag.

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
- [x] F-007 (P1) Phase 7: hardening and Release 1
  Security review and fixes, browser end-to-end test, README, version 1.0.0.
- [x] F-030 (P1) Phase 8: plugin layout
  Product moved into plugin/ with manifests, bin/factory, templates and MIT licence; engine runs from a copied install on any project; docs/PLUGIN.md.
- [x] F-026 (P1) Phase 9: plugin commands as skills
  Eight skills over the engine; init with stack detection, gate trial and doctor; verified through --plugin-dir on a Python project.
- [x] F-031 (P1) Phase 10: dashboard redesign and prebuilt GUI
  Overview with KPIs, pipeline line, throughput chart, live feed and roster; dark and light themes; connection status; page shipped prebuilt in plugin/dist.
- [x] F-035 (P1) Roles step 1: catalog, Balanced preset, assembled role files
  Catalog and preset as data, team rules validated, role files built from responsibilities, factory team and team apply, Triage only for ad-hoc items.
- [x] F-036 (P1) Roles step 2: Product Partner and Planner conversations
  brainstorm, research and plan commands; factory role, add --detail and ordered promote; documents with approval status; next-step hint in status.
- [x] F-037 (P1) Roles step 3: Architect design conversation
  design command: stack, system design, dependencies, decision records, foundation and gate, skill suggestions; factory configure, skill search and docs save; plan pauses for and resumes after the design.
- [ ] F-038 (P2) Task-time decision records and dependency checks
  The headless half of A3 and A4: when a spec adds a dependency or makes a costly decision, check it and record it. Needs the spec stage to write documents.
- [x] F-039 (P1) Roles step 4: Scribe, document structure and the graph on by default
  Scribe stage after an approved review; chronicle and role notes recorded on approve; docs command; docs map written by init; graph built by init and refreshed on landing.
- [ ] F-040 (P3) Milestone-triggered Scribe run
  Run the documentation update (K1) automatically when a milestone completes, as a proposal the user reviews.
