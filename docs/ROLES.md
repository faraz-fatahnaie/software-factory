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

Step 5 is done too, in part. **Gate 2 (the branch gate)** runs on every task: scripts (S2: a
secret scan of what the builder changed, plus whatever audit the project's gate holds) and, when
a script finds something or the change touches a sensitive area, the Security and Performance
Engineer's unattended review (S1, S5, Q2) between the tests and the review. A blocker goes back
to the builder with a proposed patch, an advisory becomes a backlog item, and anything but a
leading `SECURE` counts as blocked. Tunable per project (`security` in the config). The
conversations are `/software-factory:secure` (A5 threat model, S3 data protection, Q1 design
performance review), `/software-factory:secure audit` (S4) and `/software-factory:test` (V2
acceptance coverage, V3 accessibility). The Tester never writes code or tests: it proposes
backlog tasks and the Builder writes them. **Still planned:** gate 1 at task time (reviewing a
spec that changes the data model, an interface or a login boundary), the opt-in dynamic work
(S6 probes, Q3 load tests, Q4 runtime checks, which need a running test environment and the
release step), and milestone-triggered runs.

Version control (git and GitHub) is held by the Release Engineer, not a new agent. G3 (a script, git alone) says which finished tasks wait to reach main, which of them clash and in what order to merge them (`factory integrate`, `plugin/engine/integrate.ts`); a clash is resolved by the Builder in the task's own folder (`factory update`), never by the Release Engineer: only the builder changes code. Version control (git and GitHub): G1 sets it up (`/software-factory:git`), G2 explains what is waiting. Work always reaches GitHub as a pull request the user merges; nothing is pushed until the user presses Push or approves it in a conversation (the conversation only proposes, and the page's button acts); auto-merge is an opt-in setting that needs checks to wait for. Step 6 is done too: the Release Engineer runs as two conversations. `/software-factory:release`
holds L2 (the deployment interview), L3 (preparation: hosting recommendation, environments,
secrets, data, checks, rollback), O2 (runbooks) and L1 (version, changelog, tag); `/software-factory:deploy`
holds L4 and L5 (deploy, smoke test, rollback) and runs only on the user's request. Preparation
happens without a deploy request, as agreed; everything outward-facing waits for a clear yes to
the exact step, and credentials never enter the project or the conversation. The code a plan needs
(deployment files, health check, smoke test) is proposed as backlog tasks for the Builder, so one
role still edits code; the security engineer reviews infrastructure files automatically. The
deterministic parts are code: `factory release info`, `check [--deploy]` (a deploy needs an
approved plan and runbooks and an exact release tag) and `tag <version>` (commits only the
version files and the changelog; never pushes). **Still planned:** the unattended, milestone-
triggered preparation (the headless half of L1 and L3), maintenance intake (O3), logging and
health checks as builder tasks (O1), and the GUI for all of it.

Step 7 is done too: a project's team is a preset (Lean 6 roles, Balanced 9, Full 12) plus its own
changes, stored under `team` in `factory.config.json` and checked against the rules above before
anything is written. `factory team` shows it; `use`, `agents <n>` (3 to 13; a size between presets
folds roles of the next larger preset together; the user's own roles come on top), `move`, `merge`,
`rename`, `title`, `off`/`on`, `add`/`remove` (custom responsibilities) change it, and a change that
breaks a rule is refused with the reason and changes nothing. The pipeline finds each stage's role by
who holds the stage's responsibility (triage P4, spec B1, build B2, security S1, review C1, summary
K2) and tells that role which part of its job the stage is, so one role can do several. The
conversation commands name responsibilities, not roles, so they work in every team: when the jobs
of a command sit with several roles, all of them hold the conversation. Regrouping does not change
what a stage costs: a stage moved into another role keeps its model settings as a per-stage
setting (for example the summary stage stays on the cheap model when the scribe is folded into the
architect). In a Lean team the reviewer does the security pass as a separate stage, so the
saving is fewer roles to configure, not fewer runs. Step 8 is done: the GUI has a Team view, a Talk view
for the conversations and a Checks view for the factory's own commands. **Still planned:** editing model
settings per stage from the command line, custom unattended checks in the GUI, and release and deploy in the GUI.

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

| Role | Lean (6) | Balanced (10) | Full (13) |
| --- | --- | --- | --- |
| Researcher | | | D2 |
| Product Partner | D1 D2 D3 R1–R4 P1–P4 M1 M4–M9 M12 M15–M18 | D1 D2 D3 | D1 D3 |
| Planner | | R1–R4 P1–P3 | R1–R4 P1–P3 |
| Technical Manager | | P4 M1 M4–M9 M12 M15–M18 | P4 M1 M4–M9 M12 M15–M18 |
| Designer | | | V3, interface design |
| Architect | A1–A5 F3 B1 Q1 X1 | A1–A4 F3 B1 X1 | A1–A4 F3 B1 X1 |
| Builder | B2 V1 F1 F2 F4 O1 | B2 V1 F1 F2 F4 O1 | B2 V1 F1 F2 F4 |
| Tester | | V2 V3 | V2 |
| Reviewer | C1 S1 S3 S5 Q2 V2 V3 | C1 | C1 |
| Security and Performance Engineer | | A5 S1 S3–S6 Q1–Q4 | A5 S1 S3–S6 Q1–Q4 |
| Release Engineer | L1–L5 O2 O3 G1 G2 S4 S6 Q3 Q4 | L1–L5 O2 O3 | L1–L5 |
| Operations Engineer | | | O1 O3 |
| Scribe | K1–K4 | K1–K4 | K1–K4 |
| *Scripts (no agent)* | S2 V4 K5 M2 M3 M10 M11 M13 M14 | S2 V4 K5 M2 M3 M10 M11 M13 M14 | S2 V4 K5 M2 M3 M10 M11 M13 M14 |
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
6. **The pipeline's own jobs cannot be switched off:** B1 (spec), B2 (build) and C1 (review).
7. **Parts of one pass stay with one role,** because they run as one stage: B2 with V1, S1 with S5 and Q2, K2 with K4. A member may be switched off; the rest still move together.
8. **A custom responsibility only reads.** It can search the web, never edit files. It is either a conversation the user starts (`when: request`) or an advisory check on every task (`when: task`) that reports to the reviewer and the backlog and never blocks.

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

The conversations work from the command line first, and the GUI's Talk view runs the same instructions
as a headless session that is resumed on each message. It may read the project and write documents
under `docs/`, `README.md` and `CHANGELOG.md`; it cannot change code or governance files. Deploy is not
offered there, because it moves one approved step at a time. The Team view shows roles as columns and
responsibilities as cards; every change is previewed against the rules and the cost before it is saved,
and saving commits like `factory team`. The estimate uses what each stage cost in this project's own
runs, or a rough per-model guide until there are runs.

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
5. Tester, and the Security and Performance Engineer with its four gates (`test`, `secure`). (gate 2 and the conversations done; gate 1 at task time and the opt-in dynamic work planned)
6. Release Engineer (`release`, `deploy`) with the deployment interview. (done)
7. Lean and Full presets, free regrouping, custom responsibilities (`team`). (done)
8. GUI: Team view, command actions, chat. (done; release and deploy in the GUI are planned)

**Conversations commit their documents** (`factory docs save`, which commits only `docs/`) because task agents work from the last commit. The usual order is brainstorm, research (optional), plan (requirements), design, plan (milestones and tasks); `plan` pauses for `design` when the project has no code and no approved design, and resumes after it.

## The Technical Manager

Agreed with the project owner on 2026-11-15. A project needs someone who runs the work the way a team lead does:
what to start, what stopped and why, what to do about it, and a report to the person. Before this role, that was
the person's job: promoting items, pressing Retry on a blocked task and working out why it stopped. The Product
Partner and the other conversations cannot start work (by design), so the person was the only manager.

**Two halves.** The *supervisor* is code, with no model: it starts approved items in order, watches for stalled or
looping stages, classifies each failure and applies the safe fixes within limits (M2, M3, M10, M11, M13, M14).
The *Technical Manager agent* is a model that runs only on exceptions and at milestones: it reads the run files,
says in plain words what happened, and chooses the action (M1, M4–M9, M12, M15–M17), and it is the conversation in
Talk that the person always starts with (M18, below). Triage (P4) moved to it from the Planner.

**Autonomy.** *Autopilot* is the default and the person can switch it off: the manager promotes what the person asked
her to build, runs it and recovers a stuck task within its limits. *Assist*: it diagnoses and proposes, and the person
presses the buttons. *Off*: today's behaviour. At every level it never edits code, approves or lands a task,
pushes, merges or deploys, edits governance files, overrides a security blocker, changes scope without asking, or
spends past its budget. Every decision goes into a visible log.

**Teams.** Balanced and Full have the role (so 10 and 13 roles). Lean has no separate manager: the Product Partner
holds the same work. Shrinking a team folds the manager into the Planner first.

| ID | Responsibility | How |
| --- | --- | --- |
| P4 | Triage an item (moved from the Planner) | agent, built |
| M1 | Triage the Inbox: duplicates, size, priority, acceptance checks | agent |
| M2 | Start the work: promote what was agreed, order, parallel limit | script |
| M3 | Watch running stages: stalls, loops, repeated errors, time limits | script |
| M4 | Diagnose a stopped task in plain words | agent |
| M5 | Choose and apply the fix: retry, guide, update from main, re-spec, split, stronger model | agent |
| M6 | Split or re-scope a task that is too big | agent |
| M7 | Coordinate roles: pass findings, second opinions, settle a deadlock after two rounds | agent |
| M8 | Report progress | conversation |
| M9 | Ask the person one clear question, only for what is outside its authority | agent |
| M10 | Guard budget and time | script |
| M11 | Keep to the autonomy level and loop limits; log every decision | script |
| M12 | Track milestones and start the milestone work | agent |
| M13 | Prevent clashes: tasks touching the same files run one after the other | script |
| M14 | Check ready and done | script |
| M15 | Prepare the approval package: what changed, risks, what was verified | agent |
| M16 | Retrospective: recurring causes, proposed as backlog items | agent |
| M17 | Watch team health | conversation |
| M18 | **The face of the team**: the person always talks to the manager, who sends each message, or the part of it that concerns them, to the roles it is about, and brings their answers back as one reply | conversation |

**Build status.** Phase 4 is done: the manager's strip on Overview (her state, her last decision, a one-sentence digest of the backlog, today's spend against the limit, and a list of what she decided), the autonomy and limits in Team, her explanation on a blocked task's panel, and the same switch in Talk. Phase 3 is done: the supervisor (`plugin/engine/supervisor.ts`) runs inside `factory serve`. On autopilot it starts Ready items in order (an item only added to the Inbox, in conversation or by an agent, stays there until the person asks for it to be built; the mark "Added in conversation." records where it came from) (M2), stops a task with no sign of life for 20 minutes (M3), retries a stopped task after a wait, sends the Builder guidance after three failed builds (`factory reject` now also works on a Blocked task that has a spec), and hands anything else to the person with a plain-words explanation (M5, M9); it keeps to the limits (M10, M11: one task at once, two automatic retries per task, $5 per task and $25 per day, no new work while three tasks wait for the person) and writes every decision to the log (`manager.decision`, `manager.note`). A proposal to promote, run or retry in the manager conversation is carried out at once on autopilot. M13 is done: when more than one task may run at once, a Ready item that names a file or folder a running task is changing (in its title or detail, or in the running task's spec) waits for it, and she says so once. M14 is done. *Ready*: a task whose triage finds it too large for one task, or cannot write acceptance checks for it, stops as "not ready" before the spec (and she hands it to the person, without retrying); in a team with no triage, autopilot does not start an item that has no `Acceptance:` line (a person still can). *Done*: the reviewer is given the project's definition of done from `docs/plan/roadmap.md` when there is one, and when a task is approved by the review a `manager.decision` with the action `done` records what was checked (checks, security, review, files changed) and what to look at (nothing changed; code changed with no test), shown on the task's Summary. The notes inform the person; they do not block. Phase 2 is done: the conversation "Talk to the team" (M18, M8, M4, M5, M9), the routing described below, and the proposals `promote`, `run` and `retry` as buttons next to `push`, `merge` and `sync`. Phase 1 is done: the role, the catalog entries M1–M18 (planned, no instructions yet), the presets, the
robot (Tess) and the move of P4. M12, M16 and M17 are done, on one report of facts counted from the backlog and the log (`factory manager report`, `plugin/engine/retro.ts`): each milestone the backlog names (the `Milestone:` line the Planner writes) with its done and open tasks, why runs stopped and on which tasks, how many builds were sent back, and what each role ran, failed and cost. When the last task of a milestone finishes, the supervisor says so once (on assist too; a milestone finished more than a week ago is left alone), names the milestone work that is due, and asks the manager for a short retrospective from the report; her proposals go to the Inbox as ordinary items, which a person promotes. In conversation she answers where a milestone stands, what keeps going wrong and how the team is doing from the same report. She does not start the documents, the audit or the release preparation by herself, and does not change the team. Not built: M1, M6, M7 and M15.

### Authority rules

What a role can do is the sum of several things written at different times: its responsibilities, the tools in its role file, its skills, what its conversation may run, and what the supervisor does for it. `plugin/engine/authority.ts` compares them. Each rule is a function with a test, and `factory authority` shows the result.

| Rule | What it says | Checked when |
| --- | --- | --- |
| **T1** | Only the role that holds B2 (the builder) may have Edit or Write | the team changes, and on every load of the config |
| **T2** | The manager (M18) cannot also build (B2) or judge a task (C1, S1, S5, Q2) | the team changes |
| **T3** | Nothing unattended (an agent stage or a script) has outward, governance or configuration access | the team changes; when a responsibility is built |
| **G1** | No allow list grants what only a person may do (approve, push, merge, deploy, discard, revert) or the shell wholesale | tests; `factory authority` |
| **G2** | Conversations write documents only; the manager and the guide write nothing; task agents edit only through the build stage | tests; `factory authority` |
| **R1** | A role file never grants more than its responsibilities need | a role file is saved in Studio; `doctor`; before a task runs |
| **R2** | A role file never sets its own permission mode, hooks or connections | the same |
| **S1** | A skill never widens a role: no edits for anyone but the builder, no shell wholesale, nothing only a person may do, no hooks of its own | a skill is installed or attached, or saved in Studio (installed skills are shown, not refused) |
| **C1** | Every `factory` command a conversation's instruction names is one it may run, or the responsibility declares it as `proposes` (the person runs it, or presses a button), or the gap is written down with a reason (`KNOWN_GAPS`, empty today) | tests (a new gap fails); `factory authority` lists any known gap |
| **N1** | Every git, gh, graphify or factory command a stage's or conversation's instruction tells it to run is one it may run, or the responsibility declares it as `proposes` (named for someone else to run) | tests (a new dead end fails); `factory authority` |
| **N2** | Every button a role is taught to ask for (`PROPOSE: kind`) exists on the page and is carried out; `factory authority` says which role asks for which | tests |
| **N3** | A role's description never says it pushes, merges, deploys or approves without saying that you press it | tests |
| **M1** | The manager's limits agree (a task's limit is not above the day's); the gate never runs what only a person may | `factory manager set`; `factory authority` |

An error stops work: no task is started by hand or by autopilot while one stands. **Adding a capability safely:** declare it where it lives (the catalog's `access`, a role file's `tools`, an allow list, a skill's `allowed-tools`) and run `bun test`: the search over every move of every responsibility, and the grants and gaps checks, will say if it contradicts a rule. A conversation that is told to run a command it may not run must say so: add the command to the responsibility's `proposes` and word the instruction so the person runs it.

### Stopping loops

Everything the supervisor does by itself is bounded, and each bound is a rule with a test (`tests/factory.test.ts`, "safety"):

| Rule | What it prevents |
| --- | --- |
| A stage may answer `BLOCKED: <reason>`; the run stops and is never retried | Builder and Reviewer going round on something only a person (or another task) can fix |
| Two attempts in a row that change nothing end the run | A third build that cannot end differently |
| A check made green by lowering the bar (a suppression comment, a skipped, focused or deleted test, removed assertions, a lowered threshold, a stub) fails, unless the Builder names the file under `## Weakened checks` with a reason; a named one goes to the Reviewer to judge and to you in the handover (`plugin/engine/bar.ts`, "bar") | A green build that is green only because its checks were weakened |
| Guidance once per task, from the log, never an apology | A guided round that repeats the failure |
| `Depends on:` is read; a task waits until its dependency is merged into main | A task built without the work it needs |
| Two failed runs in a row pause autopilot | A bad day of tasks failing one after another |
| A person stopping a task pauses autopilot | The next task starting behind their back |
| Spending faster than the day's limit allows (about 40% an hour), or four automatic recoveries in an hour, pauses autopilot | A loop no single run shows |
| A run that spends the limit for one task is stopped during the run | A run spending several times the limit before it ends |
| What a conversation costs counts toward the day's limit | A limit that ignores half the spending |

### The face of the team (M18)

The person talks to one role, the Technical Manager, about anything: an idea, a failed task, a question about
security, a request to start the work. For each message the manager decides which roles it concerns, asks them,
and answers once, in its own voice, naming who said what when it matters. A trivial message gets a direct answer
and no consultations.

**How (built).** The engine runs the routing, not the model alone: the manager's first
turn names the roles to ask and what to ask each (at most three per message); the engine runs each as that role's
own conversation, with that role's own prompt, session and allow-list (documents only, never code), in parallel;
the answers go back to the manager, who writes the reply. Each consultation appears in the reply as a folded step
("Asked Noor"), opened to the question and the answer, like the commands a reply ran. The specialist conversations
stay in Talk for anyone who wants to talk to a role directly. The manager acts only through proposals
(promote, run, retry), which are buttons, or run by itself on Autopilot within its limits. Approving a reviewed task is also a proposal (`approve`), but only ever a button: the person's press is the approval, on Autopilot too.
