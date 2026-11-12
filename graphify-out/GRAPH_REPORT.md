# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- 39 files · ~18,120 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .lock 1, .css 1)

## Summary
- 229 nodes · 432 edges · 17 communities (10 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ff65e43c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- pipeline.ts
- cli.ts
- package.json
- factory.test.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- app.tsx
- Building and publishing the plugin
- Software Factory
- Backlog
- factory
- RULES.md

## God Nodes (most connected - your core abstractions)
1. `main()` - 20 edges
2. `serve()` - 11 edges
3. `Software Factory (AGENTS.md)` - 11 edges
4. `compilerOptions` - 10 edges
5. `parse()` - 9 edges
6. `Software Factory` - 9 edges
7. `claudeRunner()` - 8 edges
8. `post()` - 8 edges
9. `Building and publishing the plugin` - 8 edges
10. `parseConfig()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `F-005 Phase 5: GUI first tier` --implements--> `Control-plane GUI`  [INFERRED]
  BACKLOG.md → AGENTS.md
- `Architect (spec role)` --implements--> `Pipeline (Triage, Spec, Build, Check, Review)`  [INFERRED]
  .claude/agents/architect.md → AGENTS.md
- `Builder (implementation role)` --implements--> `Pipeline (Triage, Spec, Build, Check, Review)`  [INFERRED]
  .claude/agents/builder.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pipeline stage roles** — agents_pipeline, claude_agents_triage, claude_agents_architect, claude_agents_builder, claude_agents_reviewer [INFERRED 0.85]
- **Run-directory file handoff** — agents_factory_runs, claude_agents_triage, claude_agents_architect, claude_agents_builder, claude_agents_reviewer [INFERRED 0.85]

## Communities (17 total, 7 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.17
Nodes (19): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+11 more)

### Community 1 - "pipeline.ts"
Cohesion: 0.13
Nodes (20): agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), FactoryEvent, Row (+12 more)

### Community 2 - "cli.ts"
Cohesion: 0.17
Nodes (25): add(), endOf(), Item, move(), Section, SECTIONS, backlogPath, commitPaths() (+17 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+16 more)

### Community 4 - "factory.test.ts"
Cohesion: 0.10
Nodes (38): { dir, sh, section }, server, parse(), Config, EFFORTS, isModel(), isStr(), isStrList() (+30 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 7 - "app.tsx"
Cohesion: 0.09
Nodes (34): Act, App(), Backlog, Card(), Detail(), EFFORTS, Item, logLine() (+26 more)

### Community 8 - "Building and publishing the plugin"
Cohesion: 0.22
Nodes (8): Building and publishing the plugin, Developing and testing, Known gaps, Layout, Release checklist, Rules that come from how plugins work, Scopes, Two things in one repository

### Community 9 - "Software Factory"
Cohesion: 0.20
Nodes (9): Configuration, Control plane, How a task flows, Layout, Quick start, Requirements, Safety model, Software Factory (+1 more)

### Community 10 - "Backlog"
Cohesion: 0.25
Nodes (7): Awaiting approval, Backlog, Blocked, Done, In progress, Inbox, Ready

## Knowledge Gaps
- **86 isolated node(s):** `{ dir, sh, section }`, `server`, `name`, `version`, `private` (+81 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 106 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright-core` connect `factory.test.ts` to `package.json`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `react` connect `app.tsx` to `package.json`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `post()` connect `app.tsx` to `factory.test.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `server`, `name` to the rest of the system?**
  _86 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10303030303030303 - nodes in this community are weakly interconnected._