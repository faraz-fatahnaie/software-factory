# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- 21 files · ~6,950 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .lock 1)

## Summary
- 117 nodes · 233 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `430f5e9a`
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
- worktree.ts
- hooks.ts

## God Nodes (most connected - your core abstractions)
1. `main()` - 16 edges
2. `Software Factory (AGENTS.md)` - 11 edges
3. `compilerOptions` - 8 edges
4. `Architect (spec role)` - 7 edges
5. `Builder (implementation role)` - 7 edges
6. `add()` - 6 edges
7. `claudeRunner()` - 6 edges
8. `ensureWorktree()` - 6 edges
9. `removeWorktree()` - 6 edges
10. `parse()` - 5 edges

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

## Communities (9 total, 1 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.17
Nodes (19): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+11 more)

### Community 1 - "factory.test.ts"
Cohesion: 0.11
Nodes (24): ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), Config, FactoryEvent, Store (+16 more)

### Community 2 - "cli.ts"
Cohesion: 0.22
Nodes (17): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+9 more)

### Community 3 - "package.json"
Cohesion: 0.15
Nodes (12): devDependencies, @types/bun, typescript, name, private, scripts, factory, test (+4 more)

### Community 4 - "config.ts"
Cohesion: 0.27
Nodes (10): EFFORTS, isStr(), isStrList(), parseConfig(), Role, RoleConfig, ROLES, RUNNERS (+2 more)

### Community 5 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, types (+1 more)

### Community 7 - "worktree.ts"
Cohesion: 0.57
Nodes (7): branchOf(), commitAll(), ensureWorktree(), git(), land(), removeWorktree(), worktreeOf()

### Community 8 - "hooks.ts"
Cohesion: 0.50
Nodes (4): guard(), HookInput, real(), shellGate()

## Knowledge Gaps
- **36 isolated node(s):** `SECTIONS`, `ALLOW`, `root`, `backlogPath`, `RUNNERS` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 44 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `cli.ts` to `hooks.ts`, `factory.test.ts`, `worktree.ts`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `ensureWorktree()` connect `worktree.ts` to `cli.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `SECTIONS`, `ALLOW`, `root` to the rest of the system?**
  _36 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11330049261083744 - nodes in this community are weakly interconnected._