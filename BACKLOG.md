# Backlog

The factory's intake queue. `factory run` takes the top item under Ready.
Only the orchestrator moves items; people add to Inbox and promote to Ready.

## Inbox
- [ ] F-088 (P3) Skills grid in Studio
  One table with the skills down the side and the roles across, a tick per cell, instead of attaching and detaching per role.
- [ ] F-089 (P2) Attach skills to roles that only talk
  The Product Partner, Planner and Tester have no role file, so a skill cannot be attached to them and their conversations are offered every skill. Give them somewhere to keep an attached-skills list (a role file, or a setting in the config) so each person's list can be narrowed too.
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
- [x] F-020 Reject with feedback
  `factory reject <F-id> --feedback "…"`, `POST /api/reject`, `/software-factory:reject` and a Send back with comments box in the task panel. Same branch and spec, a new round (Build to Review again), the comments recorded on the run and shown on the card and in the panel.
- [x] F-021 Update a waiting task when main moves on
  `factory update <F-id>`, `POST /api/update`, `/software-factory:update`, a "Main moved on" tag and an Update this task button. Merges main into the task's own branch (nothing pushed): clean means only Check runs again; a clash goes to the Builder as a new round; if it cannot be finished the branch is put back. Limit: only for a task still waiting for a decision. A pull request that conflicts after approval still means discard and re-run (a follow-up).
- [ ] F-022 Pause and resume a running task from the control plane
- [ ] F-023 Model health test in the matrix: a one-token prompt per model
- [ ] F-024 Show a skill's SKILL.md in the studio before installing it, not only its skills.sh page
- [ ] F-025 Assign a local port per task worktree once tasks start dev servers
- [ ] F-027 (P1) Multi-project view at user scope
  Project registry in the plugin data folder; project switcher in the GUI.
- [x] F-032 (P2) Dashboard design refactor
  Done in step 8: rail navigation, page headers, decision-first Overview, one radius scale, status never by colour alone, keyboard and phone layouts; Lighthouse accessibility 100.
- [ ] F-033 (P2) Spending caps per role with dynamic model switching
  When a role reaches its cap or a usage limit, keep working on another model instead of stopping. Deferred by the user on 2026-11-13.
- [ ] F-034 (P2) Default skills per role
  The user will supply the skill sets for each role; until then roles ship with the existing defaults only.
- [ ] F-038 (P2) Task-time decision records and dependency checks
  The headless half of A3 and A4: when a spec adds a dependency or makes a costly decision, check it and record it. Needs the spec stage to write documents.
- [ ] F-040 (P3) Milestone-triggered Scribe run
  Run the documentation update (K1) automatically when a milestone completes, as a proposal the user reviews.
- [ ] F-042 (P2) Security gate 1 at task time
  Review a spec that changes the data model, an interface or a login boundary before the builder starts (A5 and Q1 in task mode).
- [ ] F-043 (P3) Opt-in dynamic probes, load tests and runtime checks
  S6, Q3 and Q4 against a running test environment; needs the release step and the user's request each time.
- [ ] F-045 (P2) Maintenance intake (O3)
  Turn bug reports and dependency updates into backlog items on request.
- [ ] F-046 (P2) Deployment and release in the GUI
  Show readiness, the deployment plan and the deploy log; start a release from the page. A deploy stays a conversation the user approves step by step.
- [ ] F-054 (P3) Model-written pull request description
  The text is a trimmed spec and review today; one cheap stage could write it in plain words.
- [ ] F-068 (P3) Backlog List view (a table), and drag a card from Inbox to Ready and reorder Ready (needs a small server change)
- [ ] F-066 (P3) Workroom: a floor plan with a station per stage where robots hand work over (wireframes first, with a text equivalent and reduced motion)
- [ ] F-062 (P3) Typography video of the home-bakery scenario showing every capability (later)
- [ ] F-071 (P3) Polish the landing page: self-host the fonts, test in Firefox and Safari, more real screenshots, a better video (F-062)
- [ ] F-049 (P2) Set models per role and per stage from the command line
  Today only by editing factory.config.json or the Models page (roles only); stage settings are set automatically when a stage moves.
- [ ] F-050 (P3) Custom unattended checks beyond advisory
  Let a custom check block or be triggered by sensitive areas, with the same rules as the security gate.

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
- [x] F-039 (P1) Roles step 4: Scribe, document structure and the graph on by default
  Scribe stage after an approved review; chronicle and role notes recorded on approve; docs command; docs map written by init; graph built by init and refreshed on landing.
- [x] F-041 (P1) Roles step 5: Tester and the Security and Performance Engineer
  Secret scan and sensitive-area triggers on every task, unattended security review with blockers and advisories, secure and test conversations, factory scan.
- [x] F-044 (P1) Roles step 6: Release Engineer
  release and deploy conversations, deployment plan and runbooks, version and changelog with factory release tag, readiness checks, deploys only on request.
- [x] F-047 (P1) Roles step 7: presets, regrouping and custom responsibilities
  Lean, Balanced and Full; factory team (use, agents, move, merge, rename, title, off, on, add, remove); the pipeline finds stage roles by responsibility; stage costs survive a regrouping; team and ask skills.
- [x] F-048 (P2) Team view in the GUI
  Roles as columns, responsibilities as cards, the per-task agent count and cost updating as you regroup, with preview before save. Also: Talk (chat) and Checks views, and the dashboard design pass.
- [x] F-051 (P1) Git and GitHub as a responsibility of the Release Engineer
  G1 setup and G2 status conversations (`/software-factory:git`), `factory push|merge|sync|vcs`, approve keeps the branch, pull request always, push and merge only on request, opt-in auto-merge, GitHub tile and rail chip, approval card in the Rafi conversation.
- [x] F-052 (P2) Source view
  Commits grouped by task with the robot that made each, branch lanes against main, a warning for work that is not saved, and commits not yet on GitHub.
- [x] F-053 (P2) CI status and revert
  Per-check detail on a pull request, failing checks as a backlog item, revert of a merged task (a pull request you push when GitHub is the remote), and a workflow generated from the gate commands. Merging now deletes the pull request branch so a later revert can reuse the task id.
- [x] F-055 (P2) Commit graph and a Git tool window for Source
  A lane graph across all branches (merges, HEAD, tags, remote branches), a Changes tab (folder tree, status colours, +/- counts, diff) and a Log tab (branch filter, graph, commit files and diffs), after PyCharm and VS Code.
- [x] F-056 (P1) Search over the commit graph
  Whole-history search by message, author, hash prefix, ref or task id; parents rewritten to the nearest matching ancestors so lanes stay connected; match count, highlighting, `/` shortcut, Escape to clear.
- [x] F-057 (P2) Studio skill search redesign
  Search field with a clear button and Escape, a result count, ten results at a time, an inline yes before installing (no browser dialog), skeleton while loading and an empty state.
- [x] F-064 (P1) Studio redesign
  A workspace of files (rules, team, skills), editor with line numbers and changed-line marks, Preview and History tabs, and a side panel (role, model tag, skills). Saving takes two checks (review, then commit with an editable message); changes can be discarded in place, leaving a file with changes asks first, and restoring an old version goes through the same two checks.
- [x] F-058 (P1) Show what each agent is doing right now
  A live "Now" line on each On-shift card from the tool events ("Editing src/app.ts"), the five actions before it (folded), a warning after two quiet minutes, people answering in Talk shown on shift, "last did X" for free people and on the Team view, the tab title and icon, and opt-in desktop notifications.
- [x] F-067 (P1) Backlog redesign
  A board of five columns (blocked tasks in a strip, Done folded) with richer cards, an Add item box with priority and description, filter and keys, and a side panel per task: pipeline stepper, Summary, Activity with replay, Spec, Review, Changes and a single Approve and land. Motion on the panel, tabs, stepper and cards moving between columns, all off under reduced motion.
- [x] F-070 (P1) Command palette and health signal
  ⌘K (and a search button on phones) runs the factory's checks, jumps anywhere and asks Bix; the Checks tab is gone. A Health strip and rail chip run free checks on load: setup, secrets, uncommitted rules, a placeholder gate, tasks waiting over a day, usage near the limit. Rebuild the role files moved to Team.
- [x] F-065 (P2) Per-agent panel
  Click a robot on Overview, Team or Backlog: live feed, files touched, recent stages, Stop; a free person shows what they did last and a way to talk to them.
- [x] F-069 (P1) Smoke test of every view (`bun run smoke`): seeded states, desktop and phone, console errors and axe. It found keyboard-unreachable scroll areas in Logs and Source, and a light-theme contrast miss, all fixed.
- [x] F-059 (P1) Suggested next prompts in chats
  `SUGGEST:` lines at the end of a reply become up to three one-click chips; a per-person switch in the chat header, on for the Product Partner by default, saved in the config. Checked once against a real model (Haiku).
- [x] F-060 (P1) Guide
  Bix, a read-only person in Talk, and a box under the Checks results that asks Bix about the latest result. Read-only is enforced by its permissions (checked with a real model that it refuses to write files or change the config). A bug found on the way: reloading the topic list moved you back to the conversation you were sent to.
- [x] F-061 (P1) Plugin README and runbook with the home-bakery scenario
  `plugin/README.md` (install, value, commands, what you can and cannot change) and `plugin/docs/RUNBOOK.md` (a full course; chapter 4 follows one feature request from first word to code on main, chapter 5 lists everything that can happen on the way). Commands checked against a dry run. The landing page and the video reuse the same story.
- [x] F-063 Landing page and documentation site in `site/`
  Static HTML, built from the README and runbook by `bun site/build-docs.ts`; checked by `bun run site`. Publishing it (for example GitHub Pages) is not done.
- [x] F-072 (P1) Upgrade path: create the role file of a role added by an update, by itself
  A project updated from 1.0.1 has no .claude/agents/technical-manager.md, so triage fails. Create missing role files (never overwrite) when the dashboard or a run starts, and say so in the log.
- [x] F-073 (P1) One-time notice after an update that autopilot is on
  Decided 2026-11-15: autopilot is on for every project. The first time the dashboard opens after the update, show what changed and offer assist or off. Remember it was seen.
- [x] F-074 (P1) End-to-end check of autopilot with a stand-in claude
  Run a whole task through the real pipeline and the supervisor: Ready to Awaiting approval, a failure retried, guidance after three failed builds. No model calls.
- [x] F-075 (P1) Verify the plugin update instructions against Claude Code
  The auto-update steps in the Updating guide (the Marketplaces tab in /plugin) were not checked. Check them, and claude plugin list, uninstall and tags, and fix the guide.
- [x] F-076 (P1) Stop a running reply in Talk
  A reply cannot be cancelled today. Add a Stop button next to Send while a reply is coming; end the claude process and the consultations, keep what was typed.
- [x] F-077 (P1) Keep conversations across a page reload
  Messages and session ids live in the page only, so a reload loses the whole conversation. Keep them (without file bodies) per project and conversation.
- [x] F-078 (P2) Send guidance to the Builder from the Backlog
  A blocked task with a spec can be continued with a person's comments (factory reject works on it now), but the task panel only offers Retry. Add the Send back with comments box for blocked tasks too.
- [x] F-079 (P2) Manager: keep parallel tasks from clashing (M13)
  Start a Ready item only if it is unlikely to touch the same files as a running one (files named in the spec or detail), else wait.
- [x] F-080 (P2) Manager: check ready and done (M14)
  Do not start an item without acceptance checks (triage supplies them for loose ideas); check a finished task against the definition of done before it is handed over.
- [x] F-081 (P2) Manager: milestones, retrospective and team health (M12, M16, M17)
  Say when a milestone is done and start the milestone work; propose fixes for recurring failure causes; notice a role that keeps failing or costs the most. Needs history, so built last.
- [x] F-082 (P2) Refresh the landing page and docs for the Technical Manager
  Talk to the team, autopilot, the manager strip and the attachments in Talk are missing from the landing page, the hero screenshot and the runbook walk-through.
- [x] F-083 (P1) Keep conversations on disk in the project
  Chat history lived in the browser (and in 1.0.1 only in the page), so it was lost with another browser, a port change or cleared site data. Keep each conversation in .factory/chats/, written by the server each turn; the page mirrors it.
- [x] F-084 (P1) Show context usage in each conversation
  A meter in the conversation header: how full the context is (from the last reply's usage and the model's window), amber at 70%, red at 90%, with a hint to compact. For the manager, the side conversations on hover.
- [x] F-085 (P1) Clear and compact a conversation
  A conversation menu with Compact and Clear, and the typed commands /clear and /compact (with an optional focus note). Compact runs Claude's own /compact on the session and leaves a divider with the size before and after; earlier messages stay readable, dimmed.
- [x] F-086 (P1) Offer skills and plugin commands in a conversation
  The slash list held two fixed commands. Build it from what the conversation's agent reports (skills, plugin commands) plus the dashboard's own, so it follows what is installed and does not depend on the kind of agent; the agent's own built-ins stay out.
- [x] F-028 (P1) Phase 11: brainstorming role
  A role that works out with the user what to build, for projects in any language. Design to be agreed first.
- [x] F-029 (P1) Phase 12: publish
  Public GitHub repository, install docs, real owner and author in the manifests, version bump and tag.
- [x] F-087 (P1) Choose who gets a skill, and make conversations follow it
  Install a skill for one or several roles at once (Studio: tick the people; `--role a,b`); each person's slash list offers only the skills attached to their role, and a skill typed for another role is refused.
