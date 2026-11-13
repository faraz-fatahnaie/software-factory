# Graph Report - software-factory  (2026-11-13)

## Corpus Check
- 78 files · ~81,323 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .lock 1, .css 1)

## Summary
- 544 nodes · 1378 edges · 47 communities (19 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da04959f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Software Factory (AGENTS.md)
- factory.test.ts
- release.ts
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
- team.ts
- Roles and responsibilities
- Only the orchestrator writes BACKLOG.md (rule)
- planner.md
- scribe.md
- DOCS.md
- security-performance.md
- cli.ts
- state.ts
- views.tsx
- talk.tsx
- team.tsx
- vcs.tsx

## God Nodes (most connected - your core abstractions)
1. `main()` - 69 edges
2. `serve()` - 26 edges
3. `resolveTeam()` - 20 edges
4. `activeRoles()` - 18 edges
5. `parseConfig()` - 17 edges
6. `runTask()` - 17 edges
7. `loadConfig()` - 15 edges
8. `readiness()` - 14 edges
9. `pushTask()` - 14 edges
10. `Software Factory` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Least code that works (rule)` --semantically_similar_to--> `Architect (spec role)`  [INFERRED] [semantically similar]
  AGENTS.md → .claude/agents/architect.md
- `Least code that works (rule)` --conceptually_related_to--> `Builder (implementation role)`  [INFERRED]
  AGENTS.md → .claude/agents/builder.md
- `Throughput()` --calls--> `series()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Card()` --calls--> `elapsed()`  [EXTRACTED]
  gui/app.tsx → plugin/engine/state.ts
- `Talk()` --calls--> `toolLine()`  [EXTRACTED]
  gui/talk.tsx → plugin/engine/state.ts

## Import Cycles
- None detected.

## Communities (47 total, 28 thin omitted)

### Community 0 - "Software Factory (AGENTS.md)"
Cohesion: 0.19
Nodes (16): Control-plane GUI, factory.config.json, Run directory (.factory/runs), Files are the handoff (rule), Gate (bun test and bun run typecheck), Graph-first rule, graphify-out knowledge graph, Least code that works (rule) (+8 more)

### Community 1 - "factory.test.ts"
Cohesion: 0.06
Nodes (59): { dir, sh, section }, ALLOW, chatArgs(), ChatRequest, chatTurn(), EFFORTS, MODELS, TOPICS (+51 more)

### Community 2 - "release.ts"
Cohesion: 0.11
Nodes (34): add(), endOf(), Item, move(), parse(), Section, SECTIONS, approved() (+26 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (25): dependencies, react, react-dom, devDependencies, playwright-core, @types/bun, @types/react, @types/react-dom (+17 more)

### Community 4 - "server.ts"
Cohesion: 0.12
Nodes (38): formatFindings(), buildGui(), CLI, COMMANDS, DIST, freshGui(), json(), serve() (+30 more)

### Community 5 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule, skipLibCheck (+4 more)

### Community 7 - "app.tsx"
Cohesion: 0.11
Nodes (23): Act, App(), Detail(), DOING, GROUPS, HEADS, LINK_TEXT, SECTIONS (+15 more)

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
Cohesion: 0.09
Nodes (38): Config, estimate(), EventLike, GUIDE, stageAverages(), StageEstimate, catalog, CHAT_RULES (+30 more)

### Community 14 - "Roles and responsibilities"
Cohesion: 0.11
Nodes (18): Commands, Configuration, Customizing, Decisions on record, Documents, How it reports, Knowledge graph and memory, Responsibility catalog (+10 more)

### Community 33 - "security-performance.md"
Cohesion: 0.50
Nodes (3): Review configuration and infrastructure, Review the change for performance, Review the change for security

### Community 36 - "cli.ts"
Cohesion: 0.07
Nodes (83): backlogPath, commitPaths(), editBacklog(), find(), flag(), graphEnabled(), main(), openEvents() (+75 more)

### Community 41 - "state.ts"
Cohesion: 0.15
Nodes (17): Board(), Card(), Overview(), Throughput(), useNow(), presenceOf(), Agents(), Bucket (+9 more)

### Community 42 - "views.tsx"
Cohesion: 0.12
Nodes (20): Feed(), logLine(), post(), Cost(), Doc, EFFORT_HINT, EFFORTS, Found (+12 more)

### Community 43 - "talk.tsx"
Cohesion: 0.17
Nodes (11): Chat, Chats, Checks, EFFORTS, FAILURES, MODELS, Msg, Proposal (+3 more)

### Community 44 - "team.tsx"
Cohesion: 0.12
Nodes (23): Line(), call(), Draw, IDS, OF_ROLE, P, personaFor(), Presence (+15 more)

### Community 45 - "vcs.tsx"
Cohesion: 0.18
Nodes (11): Item, Option, Select(), Skel(), ViewSkeleton(), CHECK_TEXT, GitHub(), vcsChip() (+3 more)

## Knowledge Gaps
- **190 isolated node(s):** `{ dir, sh, section }`, `Act`, `VIEWS`, `View`, `GROUPS` (+185 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 233 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `cli.ts` to `factory.test.ts`, `release.ts`, `server.ts`, `state.ts`, `team.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `playwright-core` connect `package.json` to `factory.test.ts`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `react` connect `vcs.tsx` to `package.json`, `app.tsx`, `views.tsx`, `talk.tsx`, `team.tsx`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `{ dir, sh, section }`, `Act`, `VIEWS` to the rest of the system?**
  _190 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `factory.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06086956521739131 - nodes in this community are weakly interconnected._
- **Should `release.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1066066066066066 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._