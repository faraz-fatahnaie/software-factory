# Graph Report - software-factory  (2026-11-18)

## Corpus Check
- 116 files · ~215,398 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 3, .lock 1)

## Summary
- 1070 nodes · 2967 edges · 76 communities (43 shown, 33 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8cd0dd65`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- supervisor.ts
- pipeline.ts
- package.json
- cli.ts
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
- team.tsx
- source.tsx
- studio.tsx
- source.ts
- ref_node_fs
- authority.ts
- chat.ts
- fixture.ts
- state.ts
- robots.tsx
- server.ts
- chatlog.ts
- release.ts
- manager.tsx
- skills.ts
- Runbook: building a product with the Software Factory
- loadConfig
- app.js
- Changelog
- 4. A feature, start to finish
- commands.ts
- backlog.ts
- Software Factory
- plugin/README.md
- What you get
- technical-manager.md
- 5. What can happen on the way
- CONTRIBUTING.md

## God Nodes (most connected - your core abstractions)
1. `main()` - 95 edges
2. `serve()` - 65 edges
3. `personaFor()` - 31 edges
4. `runTask()` - 30 edges
5. `activeRoles()` - 24 edges
6. `resolveTeam()` - 23 edges
7. `git()` - 23 edges
8. `App()` - 20 edges
9. `react` - 19 edges
10. `checkAuthority()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `logLine()` --calls--> `toolLine()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Throughput()` --calls--> `series()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Overview()` --calls--> `elapsed()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts

## Import Cycles
- None detected.

## Communities (76 total, 33 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "supervisor.ts"
Cohesion: 0.10
Nodes (32): Cost(), Item, AUTONOMY, ManagerSettings, FactoryEvent, Row, Store, followUps() (+24 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.06
Nodes (53): DENY_FLOOR, findWeakenings(), formatWeakenings(), git(), justified(), named(), removedLines(), Weakening (+45 more)

### Community 3 - "package.json"
Cohesion: 0.07
Nodes (28): dependencies, react, react-dom, devDependencies, axe-core, playwright-core, @types/bun, @types/react (+20 more)

### Community 4 - "cli.ts"
Cohesion: 0.06
Nodes (107): dependsOn(), SECTIONS, appendChronicle(), appendNotes(), chronicleEntry(), EventLike, parseScribe(), readNotes() (+99 more)

### Community 5 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule, skipLibCheck (+4 more)

### Community 7 - "backlog.tsx"
Cohesion: 0.11
Nodes (31): Act, activeOf(), Activity(), BacklogView(), Changes(), clock(), COLUMNS, diffs (+23 more)

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
Cohesion: 0.06
Nodes (74): ChatSettings, EFFORTS, isModel(), isStr(), isStrList(), MANAGER_DEFAULTS, MANAGER_RULES, Role (+66 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.09
Nodes (22): Authority rules, Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory (+14 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

### Community 36 - "factory.test.ts"
Cohesion: 0.08
Nodes (18): openStore(), formatPlan(), order(), plan, listeners(), newer(), ownDashboards(), Replaced (+10 more)

### Community 41 - "app.tsx"
Cohesion: 0.11
Nodes (30): App(), DOING, GROUPS, HEADS, LINK_TEXT, SECTIONS, STAGE_DID, Throughput() (+22 more)

### Community 42 - "views.tsx"
Cohesion: 0.14
Nodes (16): Feed(), logLine(), Option, Select(), Skel(), ViewSkeleton(), EFFORT_HINT, EFFORTS (+8 more)

### Community 43 - "talk.tsx"
Cohesion: 0.07
Nodes (43): fetchChats(), merge(), mirror(), Markdown(), Block, cells(), Inline, parseBlocks() (+35 more)

### Community 44 - "team.tsx"
Cohesion: 0.09
Nodes (40): Act, Line(), Overview(), DoneRow(), SendBack(), agoShort(), CommitGraph(), NotifyToggle() (+32 more)

### Community 45 - "source.tsx"
Cohesion: 0.07
Nodes (36): ago(), color(), COLORS, GraphRow, Lanes(), Ref, x(), Item (+28 more)

### Community 47 - "studio.tsx"
Cohesion: 0.11
Nodes (29): post(), counts(), DiffFile, lineDiff(), lines(), marks(), Op, Row (+21 more)

### Community 48 - "source.ts"
Cohesion: 0.15
Nodes (22): Change, changedFiles(), classifyCommit(), Commit, commitDetail(), fileDiff(), graphInfo(), GraphRow (+14 more)

### Community 49 - "ref_node_fs"
Cohesion: 0.08
Nodes (18): axe, dir, problems, server, GRAPH_IGNORE, guard(), HookInput, real() (+10 more)

### Community 50 - "authority.ts"
Cohesion: 0.15
Nodes (26): allowsCommand(), Authority, authorityMatrix(), checkAuthority(), checkConversations(), checkGrants(), checkProjectSettings(), checkRoleFile() (+18 more)

### Community 51 - "chat.ts"
Cohesion: 0.13
Nodes (26): askable(), Attachment, autonomyRules(), chatArgs(), ChatRequest, chatTurn(), checkAttachments(), compactTurn() (+18 more)

### Community 52 - "fixture.ts"
Cohesion: 0.11
Nodes (20): { dir, sh, section, cli }, axe, bin, { dir, cli }, problems, Config, ref_node_os, autopilot() (+12 more)

### Community 53 - "state.ts"
Cohesion: 0.12
Nodes (22): replyMsg(), badCommand(), Bucket, checkSetup(), clip(), Context, doing, filesTouched() (+14 more)

### Community 54 - "robots.tsx"
Cohesion: 0.13
Nodes (15): Check, CHECKS, lastRun, Open, Palette(), Row, since(), Draw (+7 more)

### Community 55 - "server.ts"
Cohesion: 0.23
Nodes (15): checkLimits(), managerOf(), trial(), allEvents(), buildGui(), CLI, COMMANDS, DIST (+7 more)

### Community 56 - "chatlog.ts"
Cohesion: 0.31
Nodes (14): appendChat(), clearChat(), FAILURES, file(), importChat(), markActed(), markCompacted(), pack() (+6 more)

### Community 57 - "release.ts"
Cohesion: 0.31
Nodes (13): shellGate(), approved(), Check, dirtyFiles(), git(), JSON_FILES, read(), readiness() (+5 more)

### Community 58 - "manager.tsx"
Cohesion: 0.21
Nodes (12): Autonomy, AUTONOMY_OPTIONS, digest(), FIELDS, isManager(), ManagerInfo, ManagerSettings, ManagerSettingsTile() (+4 more)

### Community 59 - "skills.ts"
Cohesion: 0.30
Nodes (11): projectRoles(), projectTeam(), addSkill(), attachSkill(), detachSkill(), parseFind(), parseRoles(), searchSkills() (+3 more)

### Community 60 - "Runbook: building a product with the Software Factory"
Cohesion: 0.18
Nodes (11): 1. Before you start, 2. Meet the team, 3. From an idea to a backlog, 6. Keeping control, 7. GitHub, checks and undoing, 8. Release and deploy, 9. Cheat sheet, Autopilot (+3 more)

### Community 61 - "loadConfig"
Cohesion: 0.31
Nodes (10): loadConfig(), ago(), gateIsPlaceholder(), git(), Health, healthChecks(), HealthContext, waitedLong() (+2 more)

### Community 62 - "app.js"
Cohesion: 0.20
Nodes (8): bar, cfg, clamp(), how, live, prog(), seen, term

### Community 63 - "Changelog"
Cohesion: 0.20
Nodes (10): 1.0.0, 1.0.1, 1.1.0, 1.1.1, 1.2.0, 1.2.1, 1.2.2, Also new since 1.2.0 (+2 more)

### Community 64 - "4. A feature, start to finish"
Cohesion: 0.20
Nodes (10): 4. A feature, start to finish, Step 0. Ask, Step 1. Promote, Step 2. Run, Step 3. Watch (or do not), Step 4. The stages, one by one, Step 5. It stops and waits for you, Step 6. Review what it did (+2 more)

### Community 65 - "commands.ts"
Cohesion: 0.36
Nodes (8): commandsFor(), front(), projectCommands(), roleSkillsOf(), short(), roleSkills(), Command, DASHBOARD_COMMANDS

### Community 66 - "backlog.ts"
Cohesion: 0.43
Nodes (7): add(), endOf(), FROM_CONVERSATION, move(), parse(), Section, seedStates()

### Community 67 - "Software Factory"
Cohesion: 0.25
Nodes (8): First minutes, Install, Learn more, Software Factory, Updating, What you can change, and what you cannot, What you need, Where things live

### Community 69 - "What you get"
Cohesion: 0.40
Nodes (5): The commands, The dashboard, The pipeline, The team, What you get

### Community 70 - "technical-manager.md"
Cohesion: 0.50
Nodes (3): Hold a retrospective, Track milestones, Triage an item

### Community 71 - "5. What can happen on the way"
Cohesion: 0.50
Nodes (4): 5. What can happen on the way, It stops and needs you, The factory fixes itself, Things around the pipeline

## Knowledge Gaps
- **343 isolated node(s):** `{ dir, sh, section, cli }`, `dir`, `server`, `axe`, `problems` (+338 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 415 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `personaFor()` connect `team.tsx` to `factory.test.ts`, `backlog.tsx`, `app.tsx`, `views.tsx`, `talk.tsx`, `studio.tsx`, `robots.tsx`, `manager.tsx`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `react` connect `source.tsx` to `package.json`, `backlog.tsx`, `app.tsx`, `views.tsx`, `talk.tsx`, `team.tsx`, `studio.tsx`, `robots.tsx`, `manager.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `main()` connect `cli.ts` to `supervisor.ts`, `pipeline.ts`, `backlog.ts`, `factory.test.ts`, `team.ts`, `authority.ts`, `chat.ts`, `state.ts`, `server.ts`, `release.ts`, `skills.ts`, `loadConfig`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section, cli }`, `dir`, `server` to the rest of the system?**
  _343 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `supervisor.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10252100840336134 - nodes in this community are weakly interconnected._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06390977443609022 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._