# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- 28 files · ~15,999 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .lock 1, .css 1)

## Summary
- 203 nodes · 415 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c92c232a`
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
- hooks.ts
- Software Factory

## God Nodes (most connected - your core abstractions)
1. `main()` - 20 edges
2. `serve()` - 13 edges
3. `Software Factory (AGENTS.md)` - 11 edges
4. `compilerOptions` - 10 edges
5. `parse()` - 9 edges
6. `Software Factory` - 9 edges
7. `claudeRunner()` - 8 edges
8. `post()` - 8 edges
9. `parseConfig()` - 7 edges
10. `Architect (spec role)` - 7 edges

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

## Communities (10 total, 1 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.17
Nodes (19): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+11 more)

### Community 1 - "pipeline.ts"
Cohesion: 0.13
Nodes (20): agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), FactoryEvent, Row (+12 more)

### Community 2 - "cli.ts"
Cohesion: 0.17
Nodes (26): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+18 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+16 more)

### Community 4 - "factory.test.ts"
Cohesion: 0.12
Nodes (33): { dir, sh, section }, server, Config, EFFORTS, isModel(), isStr(), isStrList(), loadConfig() (+25 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 7 - "app.tsx"
Cohesion: 0.09
Nodes (34): Act, App(), Backlog, Card(), Detail(), EFFORTS, Item, logLine() (+26 more)

### Community 8 - "hooks.ts"
Cohesion: 0.67
Nodes (3): guard(), HookInput, real()

### Community 9 - "Software Factory"
Cohesion: 0.20
Nodes (9): Configuration, Control plane, How a task flows, Layout, Quick start, Requirements, Safety model, Software Factory (+1 more)

## Knowledge Gaps
- **71 isolated node(s):** `{ dir, sh, section }`, `server`, `SECTIONS`, `ALLOW`, `root` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 82 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright-core` connect `package.json` to `factory.test.ts`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `react` connect `app.tsx` to `package.json`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `post()` connect `app.tsx` to `factory.test.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `server`, `SECTIONS` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pipeline.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11875843454790823 - nodes in this community are weakly interconnected._