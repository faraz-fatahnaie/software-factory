# Software Factory

A pipeline that takes items from `BACKLOG.md` and runs each one through Triage, Spec, Build,
Check and Review using headless Claude Code, then waits for a person to approve the result.
A local web page shows the whole thing live and lets you steer it.

Release 1 runs every role on Claude models. Other runners (Codex CLI, local models through
Ollama) are queued in `BACKLOG.md`.

## Requirements

- macOS or Linux, `git`, and [Bun](https://bun.sh) 1.2 or newer
- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` on your PATH)
- `gh`, only if you want approvals to open pull requests
- Chrome, only for `bun run e2e`

## Quick start

```sh
bun install
bun run factory serve          # control plane on http://127.0.0.1:4400
```

In the page: add an item, promote it to Ready, and press Run. Tick **Dry run** first to watch
the pipeline with canned stage outputs and no model calls.

The same from a terminal:

```sh
bun run factory add "Export a VERSION constant from plugin/engine/config.ts"
bun run factory promote F-026
bun run factory run                # top Ready item; or: run F-026 F-027, or: run --parallel 3
git diff HEAD...factory/F-026      # review the work
bun run factory approve F-026      # or: discard F-026. With a GitHub remote this keeps the branch; nothing is pushed yet
bun run factory push F-026         # push it and open a pull request, after the secret scan
bun run factory merge F-026        # merge the pull request (or use the dashboard, or GitHub)
bun run factory revert F-026       # undo a merged task: a branch to push and review when GitHub is the remote
bun run factory vcs ci             # write a GitHub Actions workflow from the gate commands, so pull requests have checks
```

## Starting from an idea

You do not need to know what to ask for. Four conversations take you from a rough idea to a
backlog the factory can build; each runs in your own Claude Code session (on whichever model
you have selected, so switch with `/model` first) and asks one question at a time:

| Command | What it does | Saves, after you approve it |
| --- | --- | --- |
| `/software-factory:brainstorm <idea>` | Works out what you want: who it is for, the problem, what success looks like, what is out of scope | `docs/product/brief.md` |
| `/software-factory:research` | Finds similar products on the web, compares them, and helps you decide what to adopt or avoid | `docs/product/research.md` |
| `/software-factory:git` | Sets up git and a private GitHub repository with you, or tells you what is waiting to be pushed or merged. Pushing and merging are your buttons or your yes, never automatic | `.gitignore`, the remote |
| `/software-factory:plan` | Turns the brief into user stories, non-functional requirements and scope, then (after the design) milestones and a task list | `docs/product/requirements.md`, `docs/plan/roadmap.md`, and tasks in the backlog Inbox |
| `/software-factory:design` | Chooses the technology with you, designs the system, checks dependencies, records decisions, defines the foundation and the gate, and suggests skills for each role | `docs/architecture/overview.md`, `docs/architecture/decisions/`, the gate in `factory.config.json` |

The usual order is brainstorm, research (optional), plan, design, then plan again: the first `plan` stops after the requirements when there is no technology yet, and the second continues with milestones and tasks. A project that already has code can skip `design`.

Nothing is written until you approve a draft, every document starts with a
`Status: approved by the user on <date>` line, and the tasks it adds wait in Inbox until you
promote them (`factory promote F-010 F-011 ...`, in the order given). Documents are committed as they are saved (`factory docs save`), because task agents work from the last commit. `factory status` shows
which documents exist and the one command to run next.

## The team

Every job a software project needs is a *responsibility*; a *role* is a group of them done by one
agent. A normal task uses three agents (spec, build, review) in every team. The size of the team
is yours to choose:

| Preset | Roles | For |
| --- | --- | --- |
| Lean | 6 | A small or personal project where nothing sensitive is handled |
| Balanced | 9 (default) | Most projects |
| Full | 12 | A product that handles personal data or payments, or that several people depend on |

`factory init --team lean|balanced|full` picks one, and `/software-factory:team` helps you choose
and change it in a conversation. From the command line: `factory team` shows the team,
`factory team presets` compares the options, `factory team agents 7` gives the closest valid team
of that size (3 to 12), and `move`, `merge`, `rename`, `title` and `off`/`on` regroup it. A change
that breaks a rule (the builder reviewing its own work, switching off the spec, build or review,
splitting a pass that runs as one stage) is refused with the reason and changes nothing.

Add your own with `factory team add "<title>" --role <role> --when request|task --instruction "..."`:
a conversation you start with `/software-factory:ask <role>`, or an advisory check on every task
that reports to the reviewer and the backlog and never blocks. Custom responsibilities only read.
Regrouping never changes what a stage costs: a stage moved to another role keeps its model
settings (`factory team` shows them as, for example, `document stage: haiku, low`).

## Security and quality

- **On every task, at no cost in tokens:** after the tests pass and before the review, a script
  reads what the builder changed and looks for hard-coded secrets (keys, tokens, private keys,
  passwords in connection addresses, committed `.env` files). A finding is sent straight back to
  the builder and never printed. Mark a known false alarm with `factory:allow-secret` on its line.
  `factory scan [--since <revision>]` runs the same scan by hand.
- **When a change touches a sensitive area,** the Security and Performance Engineer (a model,
  read-only) reviews it: logins and access control, payments, personal data, cryptography, file
  and shell access, database queries and schema, public endpoints, dependency manifests, and
  container, pipeline or infrastructure files. It traces untrusted input to dangerous places,
  checks that new endpoints verify who is asking, and looks for repeated queries, missing limits
  and leaks. A **blocker** goes back to the builder with a proposed patch; an **advisory** becomes
  a backlog item and does not stall the task. Tune it in `factory.config.json`:
  `"security": { "always": true, "paths": ["billing/"], "keywords": ["tenant"] }`, or switch it
  off with `"enabled": false` on the `security-performance` role.
- **Conversations,** like the other commands: `/software-factory:secure` builds the threat model
  (`docs/architecture/threat-model.md`), checks data protection and reviews the design for
  performance; `/software-factory:secure audit` is the static audit before a release
  (`docs/quality/`); `/software-factory:test` checks which acceptance criteria are actually
  proven and proposes tasks for the gaps, and checks accessibility for anything with an interface.
  They propose backlog items and never change code.

## Releasing and deploying

Preparing to ship and shipping are separate on purpose. **Nothing is deployed unless you ask.**

- `/software-factory:release` interviews you about where and how the product should reach its
  users, recommends hosting (with current prices and sources), and writes the deployment plan and
  the deploy, rollback and incident runbooks under `docs/runbooks/`. The code the plan needs
  (deployment configuration, a health check, a smoke test) becomes backlog tasks for the Builder.
  When you want a release, it proposes a version, writes the `CHANGELOG.md` entry, updates the
  version files and tags the commit with `factory release tag`. It never publishes or pushes.
- `/software-factory:deploy` runs only when you ask. It refuses unless the deployment plan and
  runbooks are approved and the commit is an exact release tag; it shows every action, then waits
  for your yes before each step that changes something outside the project, using the hosting
  provider's own logged-in tool. It never asks you to paste a credential or writes one to a file.
  It smoke-tests the live version, offers a rollback if a check fails, and logs the deploy in
  `docs/runbooks/deployments.md`.
- `factory release info` shows the version files, the last tag and what changed since;
  `factory release check [--deploy]` lists what blocks a release or a deploy (running tasks, a
  failing gate, secrets, missing plan or runbooks, no security audit) as failures or warnings.

## Documents and memory

`factory init` writes `docs/README.md`, a map of where each document lives and who keeps it.
The record builds up as you work:

- **Chronicle.** After a task passes review, the Scribe (a cheap model, read-only) writes two to
  four sentences on what changed and why. When you approve the task, the factory appends them to
  `docs/chronicle/YYYY-MM.md` with how it landed, which models worked on it and what it cost.
- **Role notes.** The Scribe also proposes up to three lasting facts about the project per task
  (where the tests live, a command that is needed). They are appended to `docs/roles/<role>.md`
  and shown to that role in later runs as information, never as instructions. Edit or delete any
  that are wrong.
- **README, user documentation and `AGENTS.md`.** `/software-factory:docs` has the Scribe compare
  them with what was built and propose changes, which are applied only after you approve.
- **Knowledge graph.** If [graphify](https://github.com/safishamsi/graphify) is installed
  (`uv tool install graphifyy`), `init` builds a graph of your code and it is refreshed after each
  task you approve, without calling a model. Agents read its report before opening files, which
  saves tokens. It is on by default; set `"graph": false` in `factory.config.json` to turn it off.
  A task landing as a pull request does not refresh it until the code is merged.
- The Scribe stage can be switched off with `"enabled": false` on the `scribe` role in the config.

## How a task flows

1. **Intake.** `BACKLOG.md` has six sections: Inbox, Ready, In progress, Awaiting approval,
   Blocked, Done. People add to Inbox and promote to Ready. Only the orchestrator moves items
   after that, and each move is its own commit.
2. **Isolation.** Each task gets a git worktree at `.worktrees/<F-id>/` on branch
   `factory/<F-id>`. Your checkout is never touched by a build, and tasks can run in parallel.
3. **Stages.** For an ad-hoc item the Planner triages it first (an item that already carries an `Acceptance` line in its backlog detail skips this), then the Architect writes a spec, the Builder implements it,
   the gate (`gate` in `factory.config.json`) runs, and the Reviewer checks the result against
   the spec. A failed gate or a rejected review sends the task back to Build, up to three times.
   Stages hand off through files in the worktree's `.factory/runs/<run>/`, never shared memory.
4. **Approval.** An approved build is committed on its branch and waits under Awaiting approval.
   `approve` opens a pull request if the repo has an `origin`, otherwise merges locally.
   `discard` deletes the worktree and branch and returns the item to Ready.
5. **Follow-ups.** Work an agent finds outside its task goes to Inbox, not into the build.

## Control plane

`bun run factory serve [port]` serves these views:

| View | What it does |
| --- | --- |
| Overview | What is waiting for you first, then agents working, backlog progress, Claude usage and gate pass rate; the pipeline as a line of five stations; throughput over 1 hour, 24 hours or 7 days; who is working now; live activity. |
| Backlog | The backlog as a board. Cards show stage state, model, elapsed time and cost. A task panel has the live log with replay, the spec, the review and the diff, with Approve and Discard. |
| Talk | Conversations with the roles that work with you (brainstorm, research, plan, design, test, security review, audit, documents), in the page. They read the project and write documents; they cannot change code. |
| Checks | The factory's own commands as buttons: setup check, status, release information and readiness, secret scan, rebuild role files. |
| GitHub (on Overview) | What is waiting to go to GitHub: approved tasks that are only on this machine (Push), pull requests with their checks (Merge), Sync, and an Auto-merge switch that is off by default. The rail says where the work stands. |
| Team | Every role is a robot with a name and a job; responsibilities are cards under it. Pick a preset or a size, move or switch off responsibilities, fold roles together; the agent count and the cost of a normal task update as a preview, and nothing is saved until you say so. |
| Source | A Git tool window like PyCharm's and VS Code's. **Changes**: a folder tree of what is not saved (status-coloured names, M/A/D/U letters, `+/−` bars, Untracked kept apart) with the diff of the picked file beside it. **Log**: the branches, a commit graph across every branch (lanes, merges, HEAD, tags, remote branches), and what the picked commit changed, file by file with diffs, and a Revert button on a merged task. Arrow keys move between files and commits. |
| Agents | Who is working, the model, effort and fallback chain per role, and spend and pass rate by model, role and task. |
| Logs | Every event from every task, filterable by kind and task. |
| Worktrees | Every task worktree with its branch and state. |
| Studio | Edit `AGENTS.md`, role files and skills; each save is a commit and older versions can be restored. Attach, detach, search and install skills per role. |
| Graph | The graphify knowledge graph of this repository. |

The look is glass: translucent panels over a soft colour backdrop, in light and dark. Views show skeleton placeholders while they load, and every menu is the page's own list, not the browser's. The side rail groups the views, shows whether the live connection is up, and switches between the dark and light themes. On a phone it becomes a bar across the top.

## Configuration

`factory.config.json`:

```json
{
  "setup": ["bun install"],
  "gate": ["bun test", "bun run typecheck"],
  "roles": {
    "builder": { "runner": "claude", "model": "sonnet", "effort": "medium", "fallback": ["haiku"] }
  }
}
```

- `setup` runs once in each new worktree. `gate` must pass before a build is reviewed.
- Each role that runs unattended (`planner`, `architect`, `builder`, `reviewer`, `scribe`) has a model, an effort
  level and a fallback chain. A rate limit moves the stage to the next model in the chain.
- Role prompts and tools live in `.claude/agents/<role>.md`, assembled from the responsibilities the role holds (`factory team` shows the team; `factory team apply` rebuilds the files). `AGENTS.md` holds the rules every
  role follows.
- Skills are per role: `bun run factory skill add <owner/repo@skill> --role <role>` installs one
  from [skills.sh](https://skills.sh) and attaches it. A skill is third-party instructions your
  agents will follow, so read it before you attach it.

## Safety model

Enforced in code, whatever the model does:

- **The gate** is run by the orchestrator after every build, and by a hook that stops the
  Builder from finishing while it fails.
- **Only the Builder can change files.** The other roles can read and search, and their writes
  are denied.
- **A guard hook** blocks edits to governance files (`BACKLOG.md`, `factory.config.json`,
  `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.git`, `.factory/`, `graphify-out/`), writes outside
  the task's worktree, and pushes or pull requests by agents.
- **Nothing lands without a person.** Agents cannot commit, push or merge.
- **Runs are isolated from your own Claude setup.** Stages load project settings only, so your
  personal plugins and hooks do not leak into agent output.
- **The server is local.** It binds to 127.0.0.1, rejects requests with a foreign Host or
  Origin, and shows the knowledge graph in a sandboxed frame.

Not enforced, so keep in mind:

- The guard matches shell commands as text. It is not a sandbox: a Builder can still run
  arbitrary code through the tests it writes. Review diffs before approving, and treat a diff
  that touches `plugin/engine/hooks.ts`, the gate or the tests as a change to the guardrails.
- Anything on your machine can call the local server. Do not run it on a shared host.
- The event log in `.factory/events.db` records agent messages and tool inputs. It is not
  committed, but it may contain whatever the agents read.

## Tests

```sh
bun test            # unit and HTTP tests, part of the gate
bun run typecheck   # part of the gate
bun run e2e         # drives the page in your installed Chrome with dry runs
```

## Layout

| Path | Purpose |
| --- | --- |
| `plugin/` | The product: everything a user receives when installing the plugin |
| `plugin/engine/` | Orchestrator: CLI, pipeline, Claude runner, worktrees, hooks, event log, server |
| `gui/` | Source of the control plane page (React, plain CSS); built into `plugin/dist/` |
| `plugin/templates/` | Role files, rules, backlog and config written into a project on init |
| `tests/`, `e2e/` | Unit and HTTP tests; browser end-to-end test |
| `docs/PLUGIN.md` | How the plugin is built, tested and released |
| `.claude/agents/`, `.claude/skills/` | Role prompts and installed skills |
| `AGENTS.md` | Rules for every agent working in this repo |
| `BACKLOG.md` | The intake queue, including what is planned next |
