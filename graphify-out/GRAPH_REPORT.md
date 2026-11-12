# Graph Report - software-factory  (2026-11-12)

## Corpus Check
- 22 files · ~8,689 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .lock 1)

## Summary
- 127 nodes · 268 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `956ea009`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- claude.ts
- cli.ts
- package.json
- config.ts
- compilerOptions
- F-002 Phase 2: Claude runner
- worktree.ts
- ref_node_fs
- factory.test.ts
- pipeline.ts
- events.ts

## God Nodes (most connected - your core abstractions)
1. `main()` - 18 edges
2. `Software Factory (AGENTS.md)` - 11 edges
3. `parse()` - 8 edges
4. `claudeRunner()` - 8 edges
5. `serve()` - 8 edges
6. `compilerOptions` - 8 edges
7. `Architect (spec role)` - 7 edges
8. `Builder (implementation role)` - 7 edges
9. `add()` - 6 edges
10. `loadConfig()` - 6 edges

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

## Communities (12 total, 1 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.17
Nodes (19): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+11 more)

### Community 1 - "claude.ts"
Cohesion: 0.31
Nodes (9): agentEvents(), ALLOW, classify(), claudeArgs(), claudeRunner(), hookSettings(), Runner, RunnerResult (+1 more)

### Community 2 - "cli.ts"
Cohesion: 0.20
Nodes (20): add(), endOf(), Item, move(), parse(), Section, SECTIONS, backlogPath (+12 more)

### Community 3 - "package.json"
Cohesion: 0.15
Nodes (12): devDependencies, @types/bun, typescript, name, private, scripts, factory, test (+4 more)

### Community 4 - "config.ts"
Cohesion: 0.24
Nodes (11): EFFORTS, isStr(), isStrList(), parseConfig(), Role, RoleConfig, ROLES, RUNNERS (+3 more)

### Community 5 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, types (+1 more)

### Community 7 - "worktree.ts"
Cohesion: 0.57
Nodes (7): branchOf(), commitAll(), ensureWorktree(), git(), land(), removeWorktree(), worktreeOf()

### Community 8 - "ref_node_fs"
Cohesion: 0.50
Nodes (4): guard(), HookInput, real(), ref_node_fs

### Community 9 - "factory.test.ts"
Cohesion: 0.24
Nodes (9): config, repo(), role, task, tmp(), followUps(), runTask(), ref_bun_test (+1 more)

### Community 10 - "pipeline.ts"
Cohesion: 0.25
Nodes (8): Config, Gate, Job, live, shellGate(), Status, stubRunner(), track()

### Community 11 - "events.ts"
Cohesion: 0.40
Nodes (4): FactoryEvent, Row, Store, ref_bun_sqlite

## Knowledge Gaps
- **39 isolated node(s):** `SECTIONS`, `ALLOW`, `root`, `backlogPath`, `RUNNERS` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 46 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `cli.ts` to `claude.ts`, `config.ts`, `worktree.ts`, `factory.test.ts`, `pipeline.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `claudeRunner()` connect `claude.ts` to `pipeline.ts`, `cli.ts`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `SECTIONS`, `ALLOW`, `root` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._