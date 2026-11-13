# Roles and responsibilities

The design for how the software factory covers a whole software project, from an idea to a
deployed and maintained product, for a user who is not a software engineer. Agreed with the
project owner on 2026-11-13. **Build status:** step 1 of the build order is done: the catalog
and the Balanced preset are data (`plugin/templates/catalog.json`, `presets.json`), role files
are assembled from them, and the per-task path has no mandatory Triage stage. A catalog entry
with an `instruction` is built; the rest are planned. Step 2 is done too: the Product Partner (D1, D2, D3) and the Planner's
planning work (R1–R4, P1–P3) run as conversations through `/software-factory:brainstorm`,
`:research` and `:plan`. Today six roles work: Product Partner (chat), Planner (chat, plus
unattended triage P4), Architect (B1), Builder (B2, V1) and Reviewer (C1).

Step 3 is done too: the Architect's project mode runs as `/software-factory:design`: it chooses
the technology (A1), designs the system (A2), checks dependencies (A4), writes decision records
(A3), defines the foundation and the gate (F3) and suggests skills (X1). The foundation itself
is built as ordinary tasks by the Builder from the design's Foundation section, so F1, F2 and F4
stay unbuilt as separate instructions. Recording decisions and checking dependencies *at task
time* (the headless half of A3 and A4) is still planned.

Step 4 is done too: the Scribe's unattended stage (K2, K4) runs after an approved review on a
cheap model and only reads; its summary and role notes are appended by the orchestrator when
the user approves the task, so parallel tasks never conflict on a file and an agent never edits
documents. README, user documentation and context files (K1, K3) are a conversation on request
(`/software-factory:docs`). `init` writes `docs/README.md` (the map of documents and owners),
and the knowledge graph (K5) is built by `init` and refreshed after each locally merged task when
graphify is installed. Roles with a new default (here the Scribe) are filled in for configs
written by an older plugin. The Scribe's milestone-triggered headless run of K1 is still planned.

**Conventions step 2 set:** a conversation saves a document only after the user approves a
draft, and every document starts with `Status: approved by the user on <date>`. Backlog items
written by the Planner carry `Milestone:`, `Stories:`, `Depends on:`, `Acceptance:` and
`Out of scope:` detail lines; an `Acceptance:` line makes the pipeline skip triage. The Planner
never writes a task that deploys or publishes. Conversational roles run on the model of the
user's own session, so they have no model setting in `factory.config.json`.

## The idea

The unit of the product is the **responsibility**, not the role. The factory ships a catalog
of everything a sound software project needs done. A **role** is a named group of
responsibilities run by one agent. How many roles there are is the user's choice: the tool
offers tested groupings, recommends one, and lets the user regroup. Whatever the grouping,
every responsibility stays covered.

Token cost follows how many agents run on **every task**, not how many roles exist. A role
that runs once per project or per milestone is cheap. So the per-task loop is kept short and
specialists run only on a trigger or at a milestone.

## Responsibility catalog

Each entry has an id, when it runs, how it runs, and what it may do.

- **When:** `project` (once, revisited on request), `task` (every backlog item), `milestone`,
  `trigger` (only when a condition is met), `request` (only when the user asks).
- **How:** `chat` (a conversation with the user in their own session), `headless` (unattended),
  `script` (deterministic code, no model, no tokens).
- **Access:** `read`, `web`, `write` (may change project files), `outward` (acts outside the machine).

| Id | Responsibility | When | How | Access |
| --- | --- | --- | --- | --- |
| **Discovery** | | | | |
| D1 | Brainstorm with the user: draw out the idea, challenge it, make it concrete | project | chat | read |
| D2 | Research similar products and competitors on the web; share findings; help the idea evolve | project | chat | read, web |
| D3 | Write the brief once the user approves: problem, users, goals, success criteria, non-goals | project | chat | write (docs) |
| **Requirements** | | | | |
| R1 | User stories, each with acceptance criteria | project | chat | write (docs) |
| R2 | Non-functional requirements: performance, privacy, accessibility, platforms, languages | project | chat | write (docs) |
| R3 | Constraints, risks and assumptions | project | chat | write (docs) |
| R4 | Scope the first release; park the rest | project | chat | write (docs) |
| **Architecture** | | | | |
| A1 | Choose the stack for an empty project, with reasons the user can follow | project | chat | read, web |
| A2 | System design: components, data model, interfaces | project | chat | write (docs) |
| A3 | Record each significant decision and why (at task time: planned) | project | chat | write (docs) |
| A4 | Choose dependencies; check their licences and health (at task time: planned) | project | chat | read, web |
| A5 | Threat model: what must be protected, from whom, how | project | chat | write (docs) |
| **Planning** | | | | |
| P1 | Milestones | project | chat | write (docs) |
| P2 | Break milestones into backlog tasks sized for one pipeline run, in dependency order | project, milestone | chat | backlog (via the orchestrator) |
| P3 | Definition of done for the project | project | chat | write (docs) |
| P4 | Triage an ad-hoc item: type, size, overlap, acceptance checks | trigger: item not produced by P2 | headless | read |
| **Foundation** | | | | |
| F1 | Project scaffold, formatter, linter, test framework | project (as tasks) | headless | write |
| F2 | Continuous integration | project (as tasks) | headless | write |
| F3 | Gate commands: the fast checks every build must pass | project | chat | config (via the orchestrator) |
| F4 | Secrets handling: nothing sensitive in files or history | project (as tasks) | headless | write |
| **Build** | | | | |
| B1 | Spec for one task: change, files, tests, out of scope | task | headless | read, web |
| B2 | Implement the spec, test first, least code, until the gate passes | task | headless | write |
| **Verification** | | | | |
| V1 | Unit and integration tests for the change (written with it) | task | headless | write |
| V2 | Acceptance and end-to-end tests against the user stories | milestone | headless | write (tests) |
| V3 | Accessibility and usability checks for anything with an interface | milestone | headless | read |
| V4 | Regression run of the whole suite | milestone | script | read |
| **Review** | | | | |
| C1 | Review a build: correctness, scope, maintainability, no weakened guardrails | task | headless | read |
| **Security** | | | | |
| S1 | Secure-code review: trace untrusted input from entry points to database, file and shell sinks; OWASP Top 10 flaws; every new endpoint has authentication, authorization and input validation | trigger (see the four gates) | headless | read |
| S2 | Static checks: secret scan, dependency audit for known vulnerabilities, static security scan and complexity check where the stack has a tool for it | task | script (in the gate) | read |
| S3 | Data protection: what personal data exists, where it goes, how it is protected | project, milestone | headless | read |
| S4 | Security audit before a release, including licence compliance of dependencies | request (with release) | headless | read |
| S5 | Configuration and infrastructure review: Dockerfiles, CI pipelines, infrastructure code, CORS and permission policies, weak cryptography | trigger: change touches those files | headless | read |
| S6 | Dynamic security probes against a running test environment | **opt-in**, request | headless | outward |
| **Performance** | | | | |
| Q1 | Design review for performance: query patterns that will not scale, missing indexes, unpaginated lists, caching strategy | project, and trigger: a spec changes the data model or an interface | headless | read |
| Q2 | Code-level performance review: repeated queries in loops, blocking work on a main thread, leaks and unclosed handles, oversized payloads and bundles | trigger (see the four gates) | headless | read |
| Q3 | Load and stress benchmarks against latency and throughput targets | **opt-in**, request | headless | outward |
| Q4 | After deployment: read error rates, latency and newly disclosed vulnerabilities in existing dependencies | **opt-in**, request | headless | read, outward |
| **Skills** | | | | |
| X1 | Suggest skills for each role from skills.sh, based on the project's stack and requirements; show source and install count; install only what the user accepts | project (after the architecture is approved), request | chat | read, web |
| **Release and deployment** | | | | |
| L1 | Version and changelog | milestone | headless | write |
| L2 | Deployment interview: ask the user where and how they want to deploy | request | chat | read |
| L3 | Deployment preparation: hosting recommendation, environments, scripts, runbook, rollback plan | milestone | headless | write |
| L4 | Deploy | **request only** | headless, each step approved | outward |
| L5 | Smoke test the live version; roll back if it fails | with L4 | headless | outward |
| **Operations** | | | | |
| O1 | Logging, health checks, alerts | milestone (as tasks) | headless | write |
| O2 | Runbooks: deploy, rollback, incident | milestone | headless | write (docs) |
| O3 | Maintenance intake: bug reports and dependency updates become backlog items | request | headless | backlog (via the orchestrator) |
| **Documentation and knowledge** | | | | |
| K1 | README and user documentation | request (milestone-triggered run planned) | chat | write (docs) |
| K2 | Chronicle: what was done, by which role, and why (the agent writes the summary; the orchestrator appends it when the task lands) | task (on landing) | headless, cheap model | read |
| K3 | Context files (`AGENTS.md`) kept current as the project changes | request | chat | governance (the user approves the change) |
| K4 | Each role's working notes: lasting facts about this project (the agent proposes them; the orchestrator appends them when the task lands) | when the role runs | headless | read |
| K5 | Knowledge graph kept current | task (on landing) | script | write (`graphify-out`) |

Governance is not an agent's job. The **orchestrator** (code) enforces approvals, budgets,
worktree isolation, the guard and the audit trail.

## Team presets

Three tested groupings of the catalog. `init` recommends one from what it learns about the
project (for example, a dedicated Security and Performance Engineer when the project handles logins,
personal data or heavy traffic) and shows the agents-per-task estimate for each. **Balanced is the default.**

| Role | Lean (6) | Balanced (9) | Full (12) |
| --- | --- | --- | --- |
| Researcher | | | D2 |
| Product Partner | D1 D2 D3 R1–R4 P1–P4 | D1 D2 D3 | D1 D3 |
| Planner | | R1–R4 P1–P4 | R1–R4 P1–P4 |
| Designer | | | V3, interface design |
| Architect | A1–A5 F3 B1 Q1 X1 | A1–A4 F3 B1 X1 | A1–A4 F3 B1 X1 |
| Builder | B2 V1 F1 F2 F4 O1 | B2 V1 F1 F2 F4 O1 | B2 V1 F1 F2 F4 |
| Tester | | V2 V3 | V2 |
| Reviewer | C1 S1 S3 S5 Q2 V2 V3 | C1 | C1 |
| Security and Performance Engineer | | A5 S1 S3–S6 Q1–Q4 | A5 S1 S3–S6 Q1–Q4 |
| Release Engineer | L1–L5 O2 O3 S4 S6 Q3 Q4 | L1–L5 O2 O3 | L1–L5 |
| Operations Engineer | | | O1 O2 O3 |
| Scribe | K1–K4 | K1–K4 | K1–K4 |
| *Scripts (no agent)* | S2 V4 K5 | S2 V4 K5 | S2 V4 K5 |
| **Agents on a normal task** | 3 (spec, build, review) | 3, plus Security and Performance on trigger | 3, plus Security and Performance on trigger |

In every preset the per-task path is **spec → build → gate → review**. Triage (P4) is no longer
a stage of its own: tasks produced by planning already carry acceptance checks, and only
ad-hoc items get triaged.

### Customizing

On top of a preset the user can move a responsibility to another role, merge or split roles,
rename them, switch a responsibility off, or ask for a number of agents and get the closest
valid grouping. They can add their own responsibility: a short instruction, when it runs, and
the role that holds it.

Each role's prompt is assembled from the instructions of the responsibilities it holds, so
regrouping never means rewriting prompts.

### Rules the tool enforces whatever the grouping

1. **Building and reviewing are different agents.** B2 never shares a role with C1, S1, S4, S5 or Q2.
2. **One role edits code.** `write` access to source belongs to the holder of B2.
3. **Chat and headless do not mix in one run.** A role may hold both kinds, as separate modes.
4. **Nothing core is silently dropped.** Every catalog entry is assigned, or switched off by the user on purpose.
5. **Outward actions wait for the user.** See the next section.

## The Security and Performance Engineer

It makes sure code written by the builder is safe and fast before it lands. It is **light by
default**: reading and static analysis only. Anything that needs a running system (probes,
load tests, production telemetry) is opt-in.

### The four gates

| Gate | When | What runs by default | What is opt-in |
| --- | --- | --- | --- |
| 1. Design | Before code: when the architecture is written, and when a task's spec changes the data model, an interface or an authentication boundary | A5, Q1: review the design for missing boundaries and designs that will not scale | |
| 2. Branch | After a build passes its tests, before review | S2 as scripts on every task, at no token cost. The agent (S1, S5, Q2) runs only when a script reports a finding, or the change touches a sensitive area | |
| 3. Pre-release | With a release | S4: a static audit of the whole change set since the last release | S6 probes and Q3 load tests against a test environment |
| 4. Runtime | After a deploy | Nothing | Q4, when the user asks or sets a schedule |

**Sensitive areas** that trigger gate 2, tunable per project: authentication and sessions,
access control, payments, personal data, cryptography, file and shell access, database
queries and schema, public endpoints, dependency manifests, and build, container or
infrastructure files. `init` proposes path and keyword patterns for them from the project's stack.

### How it reports

- **Severity decides what stops the pipeline.** A *blocker* is exploitable or will fail under
  expected load; it sends the task back to Build. An *advisory* is recorded as a follow-up and
  does not stall the task.
- **It proposes the fix, the Builder applies it.** Each blocker comes with a minimal patch as
  a diff. The Builder applies it and the tests run again. This keeps one role editing code
  and keeps the review independent of the author (rules 1 and 2).
- **It reads evidence, it does not guess.** Stack traces, query plans, flame graphs and
  load-test summaries are inputs when they exist.

## Skills

- **A small default set** ships with each role: the most useful, widely installed skills for
  its responsibilities. The sets will be supplied by the project owner. Today that is test-driven development
  and verification for the Builder, and security review for the reviewing roles.
- **Project-specific skills are suggested, not preinstalled** (X1). Once the stack and the
  requirements are known, the tool searches skills.sh for each role and each part of the
  project, shows the source and install count, and installs only what the user accepts. A
  skill is third-party instructions the agents will follow, so the user always sees it first.
- The user can attach or detach any skill at any time.

## What needs the user

Nothing outward-facing or hard to undo happens automatically.

| Gate | What the user approves |
| --- | --- |
| Brief | The product definition, before any planning |
| Plan | Requirements, milestones and the task list |
| Architecture | Stack and design, before foundation tasks run |
| Task landing | Each built and reviewed task (exists today) |
| Release | Version, changelog and audit results |
| Deploy | **Every deploy.** See below |

**Deployment policy.** The Release Engineer is the deployment specialist. Preparation (L3:
recommendation, scripts, runbook, rollback plan) is part of the normal pipeline so the
project is always ready to ship. It interviews the user about where and how to deploy (L2).
It deploys (L4) **only when the user asks**, never because a milestone passed. Credentials
stay out of the project: it uses the provider's own logged-in tool or the system keychain.
Where the host allows, a release goes to a test environment first.

## Documents

`init` creates this structure. Each part has an owner.

```
docs/product/        brief.md, research.md, requirements.md      Product Partner, Planner
docs/architecture/   overview.md, threat-model.md, decisions/    Architect, Security and Performance Engineer
docs/plan/           roadmap.md                                  Planner
docs/runbooks/       deploy.md, rollback.md, incident.md         Release Engineer
docs/chronicle/      YYYY-MM.md, append-only                     Scribe
docs/roles/          <role>.md, each role's working notes        that role
README.md, CHANGELOG.md                                          Scribe, Release Engineer
BACKLOG.md, AGENTS.md, factory.config.json                       the orchestrator
```

## Knowledge graph and memory

- **Knowledge graph (graphify):** optional, highly recommended, on by default. `init` builds it
  and it is updated from code after every landed task at no token cost. Every role reads the
  graph report before opening files. Without graphify the roles still work; `doctor` says what
  is missing.
- **Shared memory:** plain files. The per-role notes, the chronicle and the decision records
  are the memory, and the graph is how they are found. No separate memory database.

## Configuration

Per role: model, effort and fallback chain (exists today), plus on or off, its trigger, its
skills. All of it can change during a project, from the command line or
the GUI, and applies to the next stage that starts. Each role gets a small set of default
skills that fit its responsibilities; the user can add or remove any.

## Commands

Existing: `init`, `add`, `run`, `status`, `open`, `approve`, `discard`, `doctor`.

New, one per phase of the work: `brainstorm`, `research`, `plan`, `design`, `test`, `secure`,
`release`, `deploy`, `docs`, `team`.

The three chat roles work from the command line first. Chat inside the GUI, and a Team view
(roles as columns, responsibilities as cards, cost estimate updating as you regroup), come
later; every command should eventually also be an action in the GUI.

## Decisions on record

| Decision | Choice |
| --- | --- |
| Unit of design | The responsibility; roles are groupings of them |
| Number of agents | Configurable: presets recommended by the tool, then free regrouping within the rules |
| Default preset | Balanced |
| Triage | A catalog entry (P4) held by the Planner; not a per-task stage |
| Deployment | Prepare as part of the pipeline; interview the user; deploy on request only |
| Security and performance | One role, four gates, static by default; dynamic probes, load tests and runtime checks are opt-in |
| Fixes for security and performance findings | The engineer proposes a patch; the Builder applies it |
| Skills | A small default set per role; project-specific skills suggested from skills.sh and installed on approval |
| Interactive roles | Command line first, GUI chat later |
| Knowledge graph | Optional, recommended, on by default |
| Shared memory | Files, found through the graph |
| The factory developing itself | Not used; it is developed directly |

## Still to decide

- Which exact skills make up each role's default set: the project owner will supply the sets; tracked in `BACKLOG.md`.
- Spending caps per role, and switching to another model instead of stopping when a cap is
  reached: deferred, tracked in `BACKLOG.md`.

## Suggested build order

1. The catalog as data, role prompts assembled from it, the Balanced preset, and the per-task path without Triage. (done)
2. Product Partner and Planner (`brainstorm`, `research`, `plan`) with the product documents. (done)
3. Architect's project mode (`design`), decision records, foundation tasks. (done)
4. Scribe and the document structure; the graph on by default. (done)
5. Tester, and the Security and Performance Engineer with its four gates (`test`, `secure`).
6. Release Engineer (`release`, `deploy`) with the deployment interview.
7. Lean and Full presets, free regrouping, custom responsibilities (`team`).
8. GUI: Team view, command actions, chat.

**Conversations commit their documents** (`factory docs save`, which commits only `docs/`) because task agents work from the last commit. The usual order is brainstorm, research (optional), plan (requirements), design, plan (milestones and tasks); `plan` pauses for `design` when the project has no code and no approved design, and resumes after it.
