# Graph Report - software-factory  (2026-11-13)

## Corpus Check
- 62 files · ~49,826 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .lock 1, .css 1)

## Summary
- 372 nodes · 770 edges · 36 communities (13 shown, 23 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fde6a452`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- factory.test.ts
- cli.ts
- package.json
- config.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- app.tsx
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

## God Nodes (most connected - your core abstractions)
1. `main()` - 40 edges
2. `Roles and responsibilities` - 14 edges
3. `serve()` - 12 edges
4. `Software Factory` - 12 edges
5. `loadConfig()` - 11 edges
6. `init()` - 11 edges
7. `runTask()` - 11 edges
8. `parseConfig()` - 10 edges
9. `compilerOptions` - 10 edges
10. `Building and publishing the plugin` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `Throughput()` --calls--> `series()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Card()` --calls--> `elapsed()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `repo()` --calls--> `parse()`  [EXTRACTED]
  tests/fixture.ts → plugin/engine/backlog.ts

## Import Cycles
- None detected.

## Communities (36 total, 23 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "factory.test.ts"
Cohesion: 0.07
Nodes (57): { dir, sh, section }, readNotes(), agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings() (+49 more)

### Community 2 - "cli.ts"
Cohesion: 0.09
Nodes (48): add(), endOf(), Item, move(), Section, SECTIONS, appendChronicle(), appendNotes() (+40 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (25): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+17 more)

### Community 4 - "config.ts"
Cohesion: 0.10
Nodes (31): parse(), EFFORTS, isModel(), isStr(), isStrList(), loadConfig(), parseConfig(), Role (+23 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 7 - "app.tsx"
Cohesion: 0.07
Nodes (49): Act, App(), Board(), Card(), Detail(), Feed(), LINK_TEXT, logLine() (+41 more)

### Community 8 - "Building and publishing the plugin"
Cohesion: 0.18
Nodes (10): Building and publishing the plugin, Commands, Developing and testing, Known gaps, Layout, Release checklist, Rules that come from how plugins work, Scopes (+2 more)

### Community 9 - "Software Factory"
Cohesion: 0.15
Nodes (12): Configuration, Control plane, Documents and memory, How a task flows, Layout, Quick start, Requirements, Safety model (+4 more)

### Community 10 - "Backlog"
Cohesion: 0.25
Nodes (7): Awaiting approval, Backlog, Blocked, Done, In progress, Inbox, Ready

### Community 13 - "team.ts"
Cohesion: 0.15
Nodes (18): activeRoles(), byId, catalog, CHAT_RULES, chatPrompt(), DATA, describeTeam(), isBuilt() (+10 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.11
Nodes (18): Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory, Responsibility catalog (+10 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

## Knowledge Gaps
- **137 isolated node(s):** `{ dir, sh, section }`, `Act`, `VIEWS`, `SECTIONS`, `LINK_TEXT` (+132 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright-core` connect `factory.test.ts` to `package.json`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `react` connect `package.json` to `app.tsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `main()` connect `cli.ts` to `factory.test.ts`, `config.ts`, `team.ts`, `app.tsx`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `Act`, `VIEWS` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06573426573426573 - nodes in this community are weakly interconnected._
- **Should `cli.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09224318658280922 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._