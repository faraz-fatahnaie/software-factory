# Graph Report - software-factory  (2026-11-13)

## Corpus Check
- 48 files · ~31,231 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .lock 1, .css 1)

## Summary
- 305 nodes · 602 edges · 26 communities (13 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `53cdabdb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- pipeline.ts
- cli.ts
- package.json
- server.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- app.tsx
- Building and publishing the plugin
- Software Factory
- Backlog
- factory
- RULES.md
- factory.test.ts
- Roles and responsibilities
- hooks.ts
- Only the orchestrator writes BACKLOG.md (rule)
- planner.md

## God Nodes (most connected - your core abstractions)
1. `main()` - 26 edges
2. `Roles and responsibilities` - 14 edges
3. `serve()` - 12 edges
4. `compilerOptions` - 10 edges
5. `Building and publishing the plugin` - 10 edges
6. `Software Factory (AGENTS.md)` - 10 edges
7. `parse()` - 9 edges
8. `parseConfig()` - 9 edges
9. `init()` - 9 edges
10. `roleSkills()` - 9 edges

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

## Communities (26 total, 13 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "pipeline.ts"
Cohesion: 0.13
Nodes (21): agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), FactoryEvent, Row (+13 more)

### Community 2 - "cli.ts"
Cohesion: 0.16
Nodes (27): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+19 more)

### Community 3 - "package.json"
Cohesion: 0.07
Nodes (26): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+18 more)

### Community 4 - "server.ts"
Cohesion: 0.10
Nodes (32): { dir, sh, section }, Config, EFFORTS, isModel(), isStr(), isStrList(), loadConfig(), parseConfig() (+24 more)

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
Cohesion: 0.20
Nodes (9): Configuration, Control plane, How a task flows, Layout, Quick start, Requirements, Safety model, Software Factory (+1 more)

### Community 10 - "Backlog"
Cohesion: 0.25
Nodes (7): Awaiting approval, Backlog, Blocked, Done, In progress, Inbox, Ready

### Community 13 - "factory.test.ts"
Cohesion: 0.13
Nodes (27): applyTeam(), detect(), doctor(), GENERATED_MARK, IGNORED, init(), read(), TEMPLATES (+19 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.11
Nodes (18): Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory, Responsibility catalog (+10 more)

### Community 15 - "hooks.ts"
Cohesion: 0.67
Nodes (3): guard(), HookInput, real()

## Knowledge Gaps
- **117 isolated node(s):** `{ dir, sh, section }`, `Act`, `VIEWS`, `SECTIONS`, `LINK_TEXT` (+112 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 146 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright-core` connect `package.json` to `server.ts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `react` connect `package.json` to `app.tsx`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `main()` connect `cli.ts` to `pipeline.ts`, `server.ts`, `factory.test.ts`, `app.tsx`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `Act`, `VIEWS` to the rest of the system?**
  _117 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12681159420289856 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._