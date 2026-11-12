# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- 24 files · ~11,456 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .lock 1, .css 1)

## Summary
- 165 nodes · 328 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `64a8bd72`
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

## God Nodes (most connected - your core abstractions)
1. `main()` - 18 edges
2. `Software Factory (AGENTS.md)` - 11 edges
3. `compilerOptions` - 10 edges
4. `serve()` - 9 edges
5. `parse()` - 8 edges
6. `claudeRunner()` - 8 edges
7. `parseConfig()` - 7 edges
8. `Architect (spec role)` - 7 edges
9. `Builder (implementation role)` - 7 edges
10. `add()` - 6 edges

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

## Communities (8 total, 1 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.17
Nodes (19): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+11 more)

### Community 1 - "factory.test.ts"
Cohesion: 0.11
Nodes (33): agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), Role, ROLES (+25 more)

### Community 2 - "cli.ts"
Cohesion: 0.19
Nodes (22): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+14 more)

### Community 3 - "package.json"
Cohesion: 0.09
Nodes (21): dependencies, react, react-dom, devDependencies, @types/bun, @types/react, @types/react-dom, typescript (+13 more)

### Community 4 - "config.ts"
Cohesion: 0.16
Nodes (17): openEvents(), Config, EFFORTS, isStr(), isStrList(), loadConfig(), parseConfig(), RoleConfig (+9 more)

### Community 5 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+3 more)

### Community 7 - "app.tsx"
Cohesion: 0.12
Nodes (22): Act, App(), Backlog, Card(), Detail(), EFFORTS, Item, logLine() (+14 more)

## Knowledge Gaps
- **55 isolated node(s):** `SECTIONS`, `ALLOW`, `root`, `backlogPath`, `RUNNERS` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 65 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `package.json` to `app.tsx`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Why does `summarize()` connect `app.tsx` to `factory.test.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `toolLine()` connect `app.tsx` to `factory.test.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `SECTIONS`, `ALLOW`, `root` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `app.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1168091168091168 - nodes in this community are weakly interconnected._