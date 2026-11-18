# Graph Report - software-factory  (2026-11-18)

## Corpus Check
- 139 files · ~225,266 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 3, .lock 1)

## Summary
- 1133 nodes · 3115 edges · 99 communities (48 shown, 51 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6bf17284`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- supervisor.ts
- pipeline.ts
- package.json
- vcs.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- backlog.tsx
- Building and publishing the plugin
- Software Factory
- Backlog
- factory
- RULES.md
- team.ts
- Roles and responsibilities
- Only the orchestrator writes BACKLOG.md (rule)
- planner.md
- scribe.md
- DOCS.md
- security-performance.md
- factory.test.ts
- app.tsx
- views.tsx
- talk.tsx
- main
- source.tsx
- studio.tsx
- source.ts
- smoke.e2e.ts
- authority.ts
- chat.ts
- ref_node_fs
- state.ts
- team.tsx
- skills.ts
- cli.ts
- release.ts
- serve
- claude.ts
- Runbook: building a product with the Software Factory
- health.ts
- app.js
- Changelog
- 4. A feature, start to finish
- server.ts
- backlog.ts
- Software Factory
- plugin/README.md
- What you get
- technical-manager.md
- 5. What can happen on the way
- CONTRIBUTING.md
- upgrade.ts
- security.ts
- commands.ts
- bar.ts
- Quality bar

## God Nodes (most connected - your core abstractions)
1. `main()` - 97 edges
2. `serve()` - 65 edges
3. `runTask()` - 41 edges
4. `personaFor()` - 31 edges
5. `activeRoles()` - 26 edges
6. `resolveTeam()` - 25 edges
7. `git()` - 23 edges
8. `parseConfig()` - 22 edges
9. `App()` - 20 edges
10. `react` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `runCase()` --calls--> `claudeRunner()`  [EXTRACTED]
  evals/roles.ts → plugin/engine/claude.ts
- `runCase()` --calls--> `openStore()`  [EXTRACTED]
  evals/roles.ts → plugin/engine/events.ts
- `runCase()` --calls--> `runTask()`  [EXTRACTED]
  evals/roles.ts → plugin/engine/pipeline.ts

## Import Cycles
- None detected.

## Communities (99 total, 51 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "supervisor.ts"
Cohesion: 0.11
Nodes (30): dependsOn(), AUTONOMY, ManagerSettings, FactoryEvent, Row, Store, allEvents(), CAUSE (+22 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.11
Nodes (30): formatWeakenings(), weakeningFeedback(), checklistsFor(), readNotes(), Role, BAR_RULE, blockedReason(), definitionOfDone() (+22 more)

### Community 3 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, react, react-dom, devDependencies, axe-core, playwright-core, @types/bun, @types/react (+21 more)

### Community 4 - "vcs.ts"
Cohesion: 0.14
Nodes (33): formatFindings(), parseDiff(), armAutoMerge(), baseBranch(), batchBody(), Branch, Check, checkOf() (+25 more)

### Community 5 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule, skipLibCheck (+4 more)

### Community 7 - "backlog.tsx"
Cohesion: 0.10
Nodes (33): Act, activeOf(), Activity(), BacklogView(), Changes(), clock(), COLUMNS, diffs (+25 more)

### Community 8 - "Building and publishing the plugin"
Cohesion: 0.18
Nodes (10): Building and publishing the plugin, Commands, Developing and testing, Known gaps, Layout, Release checklist, Rules that come from how plugins work, Scopes (+2 more)

### Community 9 - "Software Factory"
Cohesion: 0.13
Nodes (15): Configuration, Control plane, Documents and memory, How a task flows, Layout, Quick start, Releasing and deploying, Requirements (+7 more)

### Community 10 - "Backlog"
Cohesion: 0.25
Nodes (7): Awaiting approval, Backlog, Blocked, Done, In progress, Inbox, Ready

### Community 13 - "team.ts"
Cohesion: 0.05
Nodes (95): project(), runCase(), graphEnabled(), ChatSettings, Config, EFFORTS, isModel(), isStr() (+87 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.09
Nodes (22): Authority rules, Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory (+14 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

### Community 36 - "factory.test.ts"
Cohesion: 0.09
Nodes (25): { dir, sh, section, cli }, sh(), MANAGER_DEFAULTS, openStore(), ref_bun_test, autopilot(), autopilotRun(), branches() (+17 more)

### Community 41 - "app.tsx"
Cohesion: 0.07
Nodes (41): Act, App(), DOING, GROUPS, HEADS, LINK_TEXT, SECTIONS, STAGE_DID (+33 more)

### Community 42 - "views.tsx"
Cohesion: 0.15
Nodes (15): Feed(), logLine(), Cost(), EFFORT_HINT, EFFORTS, KINDS, Logs(), MODEL_HINT (+7 more)

### Community 43 - "talk.tsx"
Cohesion: 0.05
Nodes (63): merge(), mirror(), Markdown(), Block, cells(), Inline, parseBlocks(), parseInline() (+55 more)

### Community 44 - "main"
Cohesion: 0.23
Nodes (15): flag(), main(), addCustom(), ids(), moveSettings(), offSettings(), onSettings(), parseChange() (+7 more)

### Community 45 - "source.tsx"
Cohesion: 0.09
Nodes (25): ago(), color(), COLORS, CommitGraph(), GraphRow, Lanes(), Ref, x() (+17 more)

### Community 47 - "studio.tsx"
Cohesion: 0.12
Nodes (27): post(), counts(), DiffFile, lineDiff(), lines(), marks(), Op, Row (+19 more)

### Community 48 - "source.ts"
Cohesion: 0.15
Nodes (22): Change, changedFiles(), classifyCommit(), Commit, commitDetail(), fileDiff(), graphInfo(), GraphRow (+14 more)

### Community 49 - "smoke.e2e.ts"
Cohesion: 0.09
Nodes (13): axe, dir, problems, server, axe, bin, { dir, cli }, problems (+5 more)

### Community 50 - "authority.ts"
Cohesion: 0.15
Nodes (20): Authority, authorityMatrix(), checkProjectSettings(), checkRoleFile(), checkSkillFile(), checkSkills(), EDITS, field() (+12 more)

### Community 51 - "chat.ts"
Cohesion: 0.12
Nodes (28): ALLOW, askable(), Attachment, autonomyRules(), chatArgs(), ChatRequest, chatTurn(), checkAttachments() (+20 more)

### Community 52 - "ref_node_fs"
Cohesion: 0.10
Nodes (19): args, dir, p, Case, CASES, FIXTURE, GATE, Outcome (+11 more)

### Community 53 - "state.ts"
Cohesion: 0.09
Nodes (36): Overview(), agoShort(), healthChip(), HealthStrip(), MARK, Icon(), PATHS, NowLine() (+28 more)

### Community 54 - "team.tsx"
Cohesion: 0.06
Nodes (47): Line(), SendBack(), Autonomy, AUTONOMY_OPTIONS, digest(), FIELDS, isManager(), ManagerInfo (+39 more)

### Community 55 - "skills.ts"
Cohesion: 0.26
Nodes (13): projectRoles(), projectTeam(), addSkill(), attachSkill(), detachSkill(), parseFind(), parseRoles(), searchSkills() (+5 more)

### Community 56 - "cli.ts"
Cohesion: 0.16
Nodes (24): appendChronicle(), appendNotes(), chronicleEntry(), EventLike, parseScribe(), stageOutput(), backlogPath, commitPaths() (+16 more)

### Community 57 - "release.ts"
Cohesion: 0.25
Nodes (15): approved(), Check, dirtyFiles(), formatChecks(), formatInfo(), git(), JSON_FILES, read() (+7 more)

### Community 58 - "serve"
Cohesion: 0.26
Nodes (13): allowsCommand(), checkAuthority(), checkConversations(), checkGrants(), checkLimits(), checkStages(), commandsNamed(), grants() (+5 more)

### Community 59 - "claude.ts"
Cohesion: 0.24
Nodes (11): DENY_FLOOR, agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), Job (+3 more)

### Community 60 - "Runbook: building a product with the Software Factory"
Cohesion: 0.18
Nodes (11): 1. Before you start, 2. Meet the team, 3. From an idea to a backlog, 6. Keeping control, 7. GitHub, checks and undoing, 8. Release and deploy, 9. Cheat sheet, Autopilot (+3 more)

### Community 61 - "health.ts"
Cohesion: 0.39
Nodes (7): ago(), gateIsPlaceholder(), git(), Health, healthChecks(), HealthContext, waitedLong()

### Community 62 - "app.js"
Cohesion: 0.20
Nodes (8): bar, cfg, clamp(), how, live, prog(), seen, term

### Community 63 - "Changelog"
Cohesion: 0.20
Nodes (10): 1.0.0, 1.0.1, 1.1.0, 1.1.1, 1.2.0, 1.2.1, 1.2.2, Also new since 1.2.0 (+2 more)

### Community 64 - "4. A feature, start to finish"
Cohesion: 0.20
Nodes (10): 4. A feature, start to finish, Step 0. Ask, Step 1. Promote, Step 2. Run, Step 3. Watch (or do not), Step 4. The stages, one by one, Step 5. It stops and waits for you, Step 6. Review what it did (+2 more)

### Community 65 - "server.ts"
Cohesion: 0.15
Nodes (26): Clash, filesOf(), formatPlan(), hasRef(), order(), plan, trial(), waiting (+18 more)

### Community 66 - "backlog.ts"
Cohesion: 0.24
Nodes (11): add(), endOf(), FROM_CONVERSATION, Item, move(), parse(), Section, SECTIONS (+3 more)

### Community 67 - "Software Factory"
Cohesion: 0.20
Nodes (10): A new project, or one you already have, First minutes, How it compares to skill packs, Install, Learn more, Software Factory, Updating, What you can change, and what you cannot (+2 more)

### Community 69 - "What you get"
Cohesion: 0.40
Nodes (5): The commands, The dashboard, The pipeline, The team, What you get

### Community 70 - "technical-manager.md"
Cohesion: 0.50
Nodes (3): Hold a retrospective, Track milestones, Triage an item

### Community 71 - "5. What can happen on the way"
Cohesion: 0.50
Nodes (4): 5. What can happen on the way, It stops and needs you, The factory fixes itself, Things around the pipeline

### Community 76 - "upgrade.ts"
Cohesion: 0.32
Nodes (7): listeners(), newer(), ownDashboards(), Replaced, replaceOlder(), VERSION, who

### Community 77 - "security.ts"
Cohesion: 0.19
Nodes (15): checklistText(), DIR, allTracked(), Change, changesInWorktree(), changesSince(), CONTENT_RULES, entropy() (+7 more)

### Community 78 - "commands.ts"
Cohesion: 0.52
Nodes (6): commandsFor(), front(), projectCommands(), roleSkillsOf(), short(), roleSkills()

### Community 80 - "bar.ts"
Cohesion: 0.24
Nodes (13): changeSize(), findWeakenings(), git(), justified(), named(), protectedBlocks(), protectedChanges(), protectedFeedback() (+5 more)

### Community 83 - "Quality bar"
Cohesion: 0.50
Nodes (3): Always, Quality bar, This project's bars

## Knowledge Gaps
- **351 isolated node(s):** `{ dir, sh, section, cli }`, `dir`, `server`, `axe`, `problems` (+346 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 445 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `team.tsx` to `package.json`, `backlog.tsx`, `app.tsx`, `views.tsx`, `talk.tsx`, `source.tsx`, `studio.tsx`, `state.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `main()` connect `main` to `supervisor.ts`, `backlog.ts`, `server.ts`, `vcs.ts`, `factory.test.ts`, `upgrade.ts`, `team.ts`, `security.ts`, `authority.ts`, `chat.ts`, `state.ts`, `skills.ts`, `cli.ts`, `release.ts`, `serve`, `claude.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `personaFor()` connect `team.tsx` to `factory.test.ts`, `backlog.tsx`, `app.tsx`, `views.tsx`, `talk.tsx`, `studio.tsx`, `state.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section, cli }`, `dir`, `server` to the rest of the system?**
  _351 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `supervisor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10606060606060606 - nodes in this community are weakly interconnected._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._