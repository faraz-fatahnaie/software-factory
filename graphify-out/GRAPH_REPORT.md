# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- Corpus is ~3,811 words - fits in a single context window. You may not need a graph.

## Summary
- 94 nodes · 164 edges · 7 communities (6 shown, 1 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.87)
- Token cost: 62,826 input · 0 output

## Community Hubs (Navigation)
- Factory Rules and Pipeline
- Pipeline, Events and Tests
- Backlog and CLI
- Package Manifest
- Config and Skills
- TypeScript Config
- Phase 2 Claude Runner

## God Nodes (most connected - your core abstractions)
1. `main()` - 11 edges
2. `Software Factory (AGENTS.md)` - 11 edges
3. `compilerOptions` - 8 edges
4. `Architect (spec role)` - 7 edges
5. `Builder (implementation role)` - 7 edges
6. `add()` - 6 edges
7. `parse()` - 5 edges
8. `move()` - 5 edges
9. `parseConfig()` - 5 edges
10. `runTask()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `Architect (spec role)` --implements--> `Pipeline (Triage, Spec, Build, Check, Review)`  [INFERRED]
  .claude/agents/architect.md → AGENTS.md
- `F-003 Phase 3: worktrees, parallel builders, hooks, guard` --references--> `Builder (implementation role)`  [EXTRACTED]
  BACKLOG.md → .claude/agents/builder.md
- `Builder (implementation role)` --implements--> `Pipeline (Triage, Spec, Build, Check, Review)`  [INFERRED]
  .claude/agents/builder.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pipeline stage roles** — agents_pipeline, claude_agents_triage, claude_agents_architect, claude_agents_builder, claude_agents_reviewer [INFERRED 0.85]
- **Run-directory file handoff** — agents_factory_runs, claude_agents_triage, claude_agents_architect, claude_agents_builder, claude_agents_reviewer [INFERRED 0.85]

## Communities (7 total, 1 thin omitted)

### Community 0 - "Factory Rules and Pipeline"
Cohesion: 0.17
Nodes (15): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Gate (bun test and bun run typecheck), graphify-out knowledge graph, Pipeline (Triage, Spec, Build, Check, Review), Software Factory (AGENTS.md), BACKLOG.md intake queue (+7 more)

### Community 1 - "Pipeline, Events and Tests"
Cohesion: 0.14
Nodes (13): Config, FactoryEvent, Store, config, role, task, followUps(), Gate (+5 more)

### Community 2 - "Backlog and CLI"
Cohesion: 0.22
Nodes (16): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+8 more)

### Community 3 - "Package Manifest"
Cohesion: 0.18
Nodes (12): devDependencies, @types/bun@^1.4.4, typescript@^7.0.2, name, private, scripts, factory, test (+4 more)

### Community 4 - "Config and Skills"
Cohesion: 0.27
Nodes (8): EFFORTS, isStr(), isStrList(), parseConfig(), Role, RoleConfig, ROLES, RUNNERS

### Community 5 - "TypeScript Config"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, types (+1 more)

## Knowledge Gaps
- **4 isolated node(s):** `factory.config.json`, `F-002 Phase 2: Claude runner`, `F-005 Phase 5: GUI first tier`, `F-011 Split security review into its own role`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 40 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 4 inferred relationships involving `Architect (spec role)` (e.g. with `Least code that works (rule)` and `Pipeline (Triage, Spec, Build, Check, Review)`) actually correct?**
  _`Architect (spec role)` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `factory.config.json`, `F-002 Phase 2: Claude runner`, `F-005 Phase 5: GUI first tier` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pipeline, Events and Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Are the 4 inferred relationships involving `Builder (implementation role)` (e.g. with `Least code that works (rule)` and `Pipeline (Triage, Spec, Build, Check, Review)`) actually correct?**
  _`Builder (implementation role)` has 4 INFERRED edges - model-reasoned connections that need verification._