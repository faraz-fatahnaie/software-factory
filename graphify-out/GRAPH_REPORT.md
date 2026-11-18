# Graph Report - software-factory  (2026-11-18)

## Corpus Check
- 117 files · ~218,120 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 3, .lock 1)

## Summary
- 1081 nodes · 2993 edges · 84 communities (51 shown, 33 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `71320a02`
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
- state.ts
- commitgraph.tsx
- source.tsx
- studio.tsx
- source.ts
- ref_node_fs
- authority.ts
- chat.ts
- teamctl.ts
- person.tsx
- team.tsx
- server.ts
- cli.ts
- release.ts
- manager.tsx
- skills.ts
- Runbook: building a product with the Software Factory
- init.ts
- app.js
- Changelog
- 4. A feature, start to finish
- worktree.ts
- backlog.ts
- Software Factory
- plugin/README.md
- What you get
- technical-manager.md
- 5. What can happen on the way
- CONTRIBUTING.md
- config.ts
- security.ts
- markdown.tsx
- retro.ts
- bar.ts
- events.ts
- upgrade.ts
- Quality bar

## God Nodes (most connected - your core abstractions)
1. `main()` - 95 edges
2. `serve()` - 65 edges
3. `runTask()` - 35 edges
4. `personaFor()` - 31 edges
5. `activeRoles()` - 24 edges
6. `resolveTeam()` - 23 edges
7. `git()` - 23 edges
8. `App()` - 20 edges
9. `react` - 19 edges
10. `checkAuthority()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `balanced()` --calls--> `resolveTeam()`  [EXTRACTED]
  tests/factory.test.ts → plugin/engine/team.ts
- `full()` --calls--> `resolveTeam()`  [EXTRACTED]
  tests/factory.test.ts → plugin/engine/team.ts
- `lean()` --calls--> `resolveTeam()`  [EXTRACTED]
  tests/factory.test.ts → plugin/engine/team.ts
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md

## Import Cycles
- None detected.

## Communities (84 total, 33 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "supervisor.ts"
Cohesion: 0.22
Nodes (17): dependsOn(), followUps(), needsTriage(), AUTONOMY_TEXT, base(), Ctx, decide(), Kind (+9 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.12
Nodes (26): formatWeakenings(), weakeningFeedback(), BAR_RULE, blockedReason(), definitionOfDone(), doneNotes(), DOUBT_WHY(), Gate (+18 more)

### Community 3 - "package.json"
Cohesion: 0.07
Nodes (28): dependencies, react, react-dom, devDependencies, axe-core, playwright-core, @types/bun, @types/react (+20 more)

### Community 4 - "vcs.ts"
Cohesion: 0.13
Nodes (35): formatFindings(), parseDiff(), armAutoMerge(), baseBranch(), BATCH, batchBody(), Branch, Check (+27 more)

### Community 5 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule, skipLibCheck (+4 more)

### Community 7 - "backlog.tsx"
Cohesion: 0.12
Nodes (27): Act, activeOf(), Activity(), BacklogView(), Changes(), clock(), COLUMNS, diffs (+19 more)

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
Cohesion: 0.11
Nodes (35): catalog, CHAT_RULES, chatBody(), chatPrompt(), chatPromptFor(), Custom, customStages(), DATA (+27 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.09
Nodes (22): Authority rules, Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory (+14 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

### Community 36 - "factory.test.ts"
Cohesion: 0.08
Nodes (19): appendChronicle(), appendNotes(), chronicleEntry(), EventLike, parseScribe(), readNotes(), stageOutput(), recordLanding() (+11 more)

### Community 41 - "app.tsx"
Cohesion: 0.10
Nodes (30): Act, App(), DOING, GROUPS, HEADS, LINK_TEXT, SECTIONS, STAGE_DID (+22 more)

### Community 42 - "views.tsx"
Cohesion: 0.15
Nodes (15): Feed(), logLine(), Select(), ViewSkeleton(), EFFORT_HINT, EFFORTS, KINDS, Logs() (+7 more)

### Community 43 - "state.ts"
Cohesion: 0.06
Nodes (67): merge(), mirror(), ACCEPT, Chat, Chats, ContextMeter(), draftKey(), EFFORTS (+59 more)

### Community 44 - "commitgraph.tsx"
Cohesion: 0.11
Nodes (24): DoneRow(), agoShort(), color(), COLORS, CommitGraph(), GraphRow, Lanes(), Ref (+16 more)

### Community 45 - "source.tsx"
Cohesion: 0.08
Nodes (28): ago(), Item, Dir, FileDiff(), FileItem, FileTree(), Line, parseUnified() (+20 more)

### Community 47 - "studio.tsx"
Cohesion: 0.10
Nodes (32): Line(), SendBack(), post(), counts(), DiffFile, lineDiff(), lines(), marks() (+24 more)

### Community 48 - "source.ts"
Cohesion: 0.15
Nodes (22): Change, changedFiles(), classifyCommit(), Commit, commitDetail(), fileDiff(), graphInfo(), GraphRow (+14 more)

### Community 49 - "ref_node_fs"
Cohesion: 0.06
Nodes (37): { dir, sh, section, cli }, axe, dir, problems, server, axe, bin, { dir, cli } (+29 more)

### Community 50 - "authority.ts"
Cohesion: 0.13
Nodes (30): allowsCommand(), Authority, authorityMatrix(), checkAuthority(), checkConversations(), checkGrants(), checkLimits(), checkProjectSettings() (+22 more)

### Community 51 - "chat.ts"
Cohesion: 0.10
Nodes (34): DENY_FLOOR, askable(), Attachment, autonomyRules(), chatArgs(), ChatRequest, chatTurn(), checkAttachments() (+26 more)

### Community 52 - "teamctl.ts"
Cohesion: 0.26
Nodes (13): Config, estimate(), EventLike, GUIDE, stageAverages(), StageEstimate, holderOf(), perTask() (+5 more)

### Community 53 - "person.tsx"
Cohesion: 0.23
Nodes (15): Overview(), useNow(), money(), PersonPanel(), reduced(), STAGE, Tab, took() (+7 more)

### Community 54 - "team.tsx"
Cohesion: 0.09
Nodes (27): Check, CHECKS, lastRun, Open, Palette(), Row, since(), Draw (+19 more)

### Community 55 - "server.ts"
Cohesion: 0.11
Nodes (33): compactTurn(), resumeChat(), stopChat(), TOPICS, commandsFor(), front(), projectCommands(), roleSkillsOf() (+25 more)

### Community 56 - "cli.ts"
Cohesion: 0.12
Nodes (39): parse(), backlogPath, commitPaths(), editBacklog(), find(), flag(), graphEnabled(), main() (+31 more)

### Community 57 - "release.ts"
Cohesion: 0.27
Nodes (14): approved(), Check, dirtyFiles(), formatChecks(), formatInfo(), git(), JSON_FILES, read() (+6 more)

### Community 58 - "manager.tsx"
Cohesion: 0.23
Nodes (11): Autonomy, AUTONOMY_OPTIONS, digest(), FIELDS, isManager(), ManagerInfo, ManagerSettings, ManagerSettingsTile() (+3 more)

### Community 59 - "skills.ts"
Cohesion: 0.35
Nodes (10): projectRoles(), projectTeam(), addSkill(), attachSkill(), parseFind(), parseRoles(), searchSkills(), setSkill() (+2 more)

### Community 60 - "Runbook: building a product with the Software Factory"
Cohesion: 0.18
Nodes (11): 1. Before you start, 2. Meet the team, 3. From an idea to a backlog, 6. Keeping control, 7. GitHub, checks and undoing, 8. Release and deploy, 9. Cheat sheet, Autopilot (+3 more)

### Community 61 - "init.ts"
Cohesion: 0.16
Nodes (20): isModel(), parseConfig(), teamOf(), withRoleDefaults(), applyTeam(), configure(), DOC_PATHS, DOCS (+12 more)

### Community 62 - "app.js"
Cohesion: 0.20
Nodes (8): bar, cfg, clamp(), how, live, prog(), seen, term

### Community 63 - "Changelog"
Cohesion: 0.20
Nodes (10): 1.0.0, 1.0.1, 1.1.0, 1.1.1, 1.2.0, 1.2.1, 1.2.2, Also new since 1.2.0 (+2 more)

### Community 64 - "4. A feature, start to finish"
Cohesion: 0.20
Nodes (10): 4. A feature, start to finish, Step 0. Ask, Step 1. Promote, Step 2. Run, Step 3. Watch (or do not), Step 4. The stages, one by one, Step 5. It stops and waits for you, Step 6. Review what it did (+2 more)

### Community 65 - "worktree.ts"
Cohesion: 0.28
Nodes (16): Clash, filesOf(), formatPlan(), hasRef(), waiting, abortUpdate(), behindBy(), branchOf() (+8 more)

### Community 66 - "backlog.ts"
Cohesion: 0.33
Nodes (8): add(), endOf(), FROM_CONVERSATION, Item, move(), Section, SECTIONS, seedStates()

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

### Community 76 - "config.ts"
Cohesion: 0.13
Nodes (15): AUTONOMY, ChatSettings, EFFORTS, isStr(), isStrList(), MANAGER_DEFAULTS, MANAGER_RULES, ManagerSettings (+7 more)

### Community 77 - "security.ts"
Cohesion: 0.19
Nodes (14): allTracked(), Change, changesSince(), CONTENT_RULES, entropy(), Finding, git(), LOCKFILE (+6 more)

### Community 78 - "markdown.tsx"
Cohesion: 0.27
Nodes (7): Markdown(), Block, cells(), Inline, parseBlocks(), parseInline(), startsBlock()

### Community 79 - "retro.ts"
Cohesion: 0.25
Nodes (10): Cost(), CAUSE, health, Milestone, milestones(), n(), report(), costs() (+2 more)

### Community 80 - "bar.ts"
Cohesion: 0.33
Nodes (10): changeSize(), findWeakenings(), git(), justified(), named(), removedLines(), sizeLimit(), Weakening (+2 more)

### Community 81 - "events.ts"
Cohesion: 0.22
Nodes (8): FactoryEvent, openStore(), Row, Store, ref_bun_sqlite, doubtRun(), manage(), replay()

### Community 82 - "upgrade.ts"
Cohesion: 0.32
Nodes (7): listeners(), newer(), ownDashboards(), Replaced, replaceOlder(), VERSION, who

### Community 83 - "Quality bar"
Cohesion: 0.50
Nodes (3): Always, Quality bar, This project's bars

## Knowledge Gaps
- **345 isolated node(s):** `{ dir, sh, section, cli }`, `dir`, `server`, `axe`, `problems` (+340 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 418 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `personaFor()` connect `studio.tsx` to `factory.test.ts`, `backlog.tsx`, `app.tsx`, `views.tsx`, `state.ts`, `commitgraph.tsx`, `person.tsx`, `team.tsx`, `manager.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `react` connect `views.tsx` to `package.json`, `backlog.tsx`, `app.tsx`, `state.ts`, `commitgraph.tsx`, `source.tsx`, `markdown.tsx`, `studio.tsx`, `person.tsx`, `team.tsx`, `manager.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `main()` connect `cli.ts` to `supervisor.ts`, `backlog.ts`, `worktree.ts`, `factory.test.ts`, `vcs.ts`, `state.ts`, `config.ts`, `security.ts`, `team.ts`, `retro.ts`, `authority.ts`, `chat.ts`, `teamctl.ts`, `upgrade.ts`, `server.ts`, `release.ts`, `skills.ts`, `init.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section, cli }`, `dir`, `server` to the rest of the system?**
  _345 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11965811965811966 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `vcs.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13174603174603175 - nodes in this community are weakly interconnected._