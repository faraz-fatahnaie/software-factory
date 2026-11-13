# Graph Report - software-factory  (2026-11-13)

## Corpus Check
- 80 files · ~85,900 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .lock 1, .css 1)

## Summary
- 577 nodes · 1475 edges · 52 communities (24 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `76aa2b1b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- factory.test.ts
- pipeline.ts
- package.json
- cli.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- data.ts
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
- release.ts
- app.tsx
- views.tsx
- talk.tsx
- team.tsx
- source.tsx
- config.ts
- server.ts
- teamctl.ts
- estimate.ts
- chronicle.ts

## God Nodes (most connected - your core abstractions)
1. `main()` - 73 edges
2. `serve()` - 27 edges
3. `resolveTeam()` - 20 edges
4. `activeRoles()` - 18 edges
5. `parseConfig()` - 17 edges
6. `runTask()` - 17 edges
7. `loadConfig()` - 15 edges
8. `pushTask()` - 15 edges
9. `git()` - 15 edges
10. `readiness()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `logLine()` --calls--> `toolLine()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Throughput()` --calls--> `series()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Card()` --calls--> `elapsed()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts

## Import Cycles
- None detected.

## Communities (52 total, 28 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "factory.test.ts"
Cohesion: 0.13
Nodes (24): graphEnabled(), GRAPH_IGNORE, graphifyInstalled(), updateGraph(), applyTeam(), detect(), DOC_PATHS, DOCS (+16 more)

### Community 2 - "pipeline.ts"
Cohesion: 0.06
Nodes (51): ALLOW, chatArgs(), ChatRequest, chatTurn(), EFFORTS, MODELS, TOPICS, agentEvents() (+43 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+16 more)

### Community 4 - "cli.ts"
Cohesion: 0.08
Nodes (67): backlogPath, commitPaths(), editBacklog(), find(), flag(), main(), openEvents(), readItems() (+59 more)

### Community 5 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule, skipLibCheck (+4 more)

### Community 7 - "data.ts"
Cohesion: 0.29
Nodes (10): App(), Backlog, call(), Link, useBacklog(), useEvents(), useHash(), useTeam() (+2 more)

### Community 8 - "Building and publishing the plugin"
Cohesion: 0.18
Nodes (10): Building and publishing the plugin, Commands, Developing and testing, Known gaps, Layout, Release checklist, Rules that come from how plugins work, Scopes (+2 more)

### Community 9 - "Software Factory"
Cohesion: 0.13
Nodes (14): Configuration, Control plane, Documents and memory, How a task flows, Layout, Quick start, Releasing and deploying, Requirements (+6 more)

### Community 10 - "Backlog"
Cohesion: 0.25
Nodes (7): Awaiting approval, Backlog, Blocked, Done, In progress, Inbox, Ready

### Community 13 - "team.ts"
Cohesion: 0.13
Nodes (27): catalog, CHAT_RULES, chatBody(), chatPrompt(), chatPromptFor(), Custom, customStages(), DATA (+19 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.11
Nodes (18): Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory, Responsibility catalog (+10 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

### Community 36 - "release.ts"
Cohesion: 0.10
Nodes (32): { dir, sh, section }, add(), endOf(), Item, move(), parse(), Section, SECTIONS (+24 more)

### Community 41 - "app.tsx"
Cohesion: 0.10
Nodes (28): Act, Board(), Card(), Detail(), DOING, GROUPS, HEADS, LINK_TEXT (+20 more)

### Community 42 - "views.tsx"
Cohesion: 0.13
Nodes (19): Feed(), logLine(), post(), Cost(), Doc, EFFORT_HINT, EFFORTS, Found (+11 more)

### Community 43 - "talk.tsx"
Cohesion: 0.12
Nodes (17): Chat, Chats, Checks, EFFORTS, FAILURES, MODELS, Msg, Proposal (+9 more)

### Community 44 - "team.tsx"
Cohesion: 0.12
Nodes (23): Line(), Draw, IDS, OF_ROLE, P, personaFor(), Presence, PRESENCE_TEXT (+15 more)

### Community 45 - "source.tsx"
Cohesion: 0.10
Nodes (22): Item, Icon(), PATHS, ago(), BY, Change, Commit, Group (+14 more)

### Community 47 - "config.ts"
Cohesion: 0.16
Nodes (22): EFFORTS, isModel(), isStr(), isStrList(), loadConfig(), parseConfig(), Role, RoleConfig (+14 more)

### Community 48 - "server.ts"
Cohesion: 0.19
Nodes (18): projectRoles(), projectTeam(), buildGui(), CLI, COMMANDS, DIST, freshGui(), json() (+10 more)

### Community 49 - "teamctl.ts"
Cohesion: 0.39
Nodes (11): mergeRoles(), teamForAgents(), ids(), moveSettings(), offSettings(), onSettings(), parseChange(), parseChanges() (+3 more)

### Community 50 - "estimate.ts"
Cohesion: 0.33
Nodes (9): estimate(), EventLike, GUIDE, stageAverages(), StageEstimate, holderOf(), perTask(), STAGE_DUTIES (+1 more)

### Community 51 - "chronicle.ts"
Cohesion: 0.33
Nodes (8): appendChronicle(), appendNotes(), chronicleEntry(), EventLike, parseScribe(), readNotes(), stageOutput(), recordLanding()

## Knowledge Gaps
- **205 isolated node(s):** `{ dir, sh, section }`, `Act`, `VIEWS`, `View`, `GROUPS` (+200 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 249 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `cli.ts` to `factory.test.ts`, `pipeline.ts`, `release.ts`, `app.tsx`, `team.ts`, `config.ts`, `server.ts`, `teamctl.ts`, `estimate.ts`, `chronicle.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `playwright-core` connect `release.ts` to `package.json`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `react` connect `team.tsx` to `package.json`, `data.ts`, `app.tsx`, `views.tsx`, `talk.tsx`, `source.tsx`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `Act`, `VIEWS` to the rest of the system?**
  _205 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12561576354679804 - nodes in this community are weakly interconnected._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06265664160401002 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._